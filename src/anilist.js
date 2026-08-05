/**
 * ANIQUEST â€” AniList (GraphQL) data source.
 *
 * AniList is free, keyless, CORS-enabled and currently far more reliable
 * than Jikan. All data is normalized into the same shape the UI expects
 * (Jikan-like), so pages work identically no matter which backend served it.
 *
 * Rate limiting: token bucket â€” burst of 3, refills 1 token / 2s (~30/min,
 * within AniList's documented 90/min query budget with headroom).
 */

const ENDPOINT = 'https://graphql.anilist.co';

/* ---------------- Token bucket rate limiter ---------------- */
let tokens = 3;
let lastRefill = Date.now();
const CAPACITY = 3;
const REFILL_MS = 2000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function takeToken() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    if (now - lastRefill >= REFILL_MS) {
      const refilled = Math.floor((now - lastRefill) / REFILL_MS);
      tokens = Math.min(CAPACITY, tokens + refilled);
      lastRefill += refilled * REFILL_MS;
    }
    if (tokens > 0) {
      tokens -= 1;
      return;
    }
    await sleep(250);
  }
}

/* ---------------- GraphQL client ---------------- */
async function gql(query, variables) {
  await takeToken();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList error ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList error');
  return json.data;
}

/* ---------------- Queries ---------------- */
const LIST_QUERY = `
query($page:Int,$perPage:Int,$search:String,$type:MediaType,$status:MediaStatus,
       $season:MediaSeason,$seasonYear:Int,$sort:[MediaSort],$format:MediaFormat){
  Page(page:$page,perPage:$perPage){
    pageInfo{ currentPage lastPage hasNextPage }
    media(search:$search,type:$type,status:$status,season:$season,seasonYear:$seasonYear,
          sort:$sort,format:$format,isAdult:false){
      id
      type
      title{ romaji english native }
      coverImage{ extraLarge large medium color }
      description
      averageScore popularity format status season seasonYear
      startDate{ year }
      episodes chapters volumes duration
      genres
    }
  }
}`;

const DETAIL_QUERY = `
query($id:Int,$type:MediaType){
  Media(id:$id,type:$type){
    id
    type
    title{ romaji english native }
    coverImage{ extraLarge large medium color }
    bannerImage
    description
    averageScore popularity format status season seasonYear
    startDate{ year } endDate{ year }
    episodes chapters volumes duration
    genres
    studios{ nodes{ name } }
    siteUrl
    isAdult
    rankings{ rank allTime }
    synonyms
    relations{
      edges{
        relationType
        node{ id title{ romaji } type coverImage{ large } }
      }
    }
    characters(page:1,perPage:10){
      nodes{ id name{ full } image{ medium } }
      edges{ role }
    }
  }
}`;

/* ---------------- Filter mapping (whitelisted) ---------------- */
const FORMAT = {
  tv: 'TV', movie: 'MOVIE', ova: 'OVA', ona: 'ONA',
  special: 'SPECIAL', music: 'MUSIC',
  manga: 'MANGA', novel: 'NOVEL', lightnovel: 'NOVEL', oneshot: 'ONE_SHOT', doujin: 'MANGA',
};
const STATUS = {
  airing: 'RELEASING', publishing: 'RELEASING', complete: 'FINISHED',
  upcoming: 'NOT_YET_RELEASED', hiatus: 'HIATUS', discontinued: 'CANCELLED',
};
const SORT = {
  score: ['SCORE_DESC', 'SCORE'],
  members: ['POPULARITY_DESC', 'POPULARITY'],
  title: ['TITLE_ROMAJI_ASC', 'TITLE_ROMAJI_DESC'],
  start_date: ['START_DATE_DESC', 'START_DATE'],
  end_date: ['END_DATE_DESC', 'END_DATE'],
  chapters: ['EPISODES_DESC', 'EPISODES'],
};

function toSort(orderBy, sort) {
  const pair = SORT[orderBy] || SORT.score;
  return [sort === 'asc' ? pair[1] : pair[0]];
}

/* ---------------- Normalizer -> Jikan-like shape ---------------- */
const NL = String.fromCharCode(10); // newline
const WS = String.fromCharCode(9, 10, 13); // tab, newline, carriage-return

function stripHtml(s) {
  return String(s || '')
    .replace(/<br[^>]*>/gi, NL) // <br> -> newline
    .replace(/<[^>]+>/g, '') // strip remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(new RegExp('[' + WS + ']{3,}', 'g'), NL + NL)
    .trim();
}

const STATUS_LABEL = {
  RELEASING: 'Airing',
  FINISHED: 'Finished',
  NOT_YET_RELEASED: 'Upcoming',
  CANCELLED: 'Cancelled',
  HIATUS: 'On Hiatus',
};

function normalize(m) {
  const t = m.title || {};
  const kind = m.type === 'MANGA' ? 'manga' : 'anime';
  const cover = m.coverImage || {};
  const year = m.seasonYear || m.startDate?.year;
  // Status label differs by media kind (anime "Airing" vs manga "Publishing").
  const statusLabel =
    kind === 'manga' && m.status === 'RELEASING'
      ? 'Publishing'
      : STATUS_LABEL[m.status] || m.status || '';
  return {
    mal_id: m.id,
    kind,
    title: t.romaji || t.english || t.native || 'Untitled',
    title_english: t.english,
    type: m.format || (kind === 'manga' ? 'MANGA' : 'TV'),
    status: statusLabel,
    year,
    score: m.averageScore != null ? Math.round(m.averageScore) / 10 : null,
    images: {
      jpg: {
        image_url: cover.medium || cover.large || '',
        large_image_url: cover.large || cover.extraLarge || cover.medium || '',
      },
    },
    genres: (m.genres || []).map((g, i) => ({ mal_id: i, name: g })),
    synopsis: stripHtml(m.description),
    episodes: m.episodes ?? undefined,
    chapters: m.chapters ?? undefined,
    volumes: m.volumes ?? undefined,
    duration: m.duration ? `${m.duration} min` : undefined,
    members: m.popularity ?? undefined,
    rank: (m.rankings || []).find((r) => r.allTime)?.rank ?? undefined,
    studios: (m.studios?.nodes || []).map((s, i) => ({ mal_id: i, name: s.name })),
    url: m.siteUrl || `https://anilist.co/${kind}/${m.id}`,
    relations: (m.relations?.edges || []).map((e) => ({
      relation: e.relationType,
      entry: [
        {
          mal_id: e.node.id,
          name: e.node.title?.romaji || 'Unknown',
          type: e.node.type === 'MANGA' ? 'manga' : 'anime',
          images: { jpg: { large_image_url: e.node.coverImage?.large || '' } },
        },
      ],
    })),
    characters: (m.characters?.nodes || []).map((n, i) => ({
      character: {
        mal_id: n.id,
        name: n.name?.full || 'Unknown',
        images: { jpg: { image_url: n.image?.medium || '' } },
      },
      role: m.characters.edges?.[i]?.role || '',
    })),
  };
}

function pageInfo(p) {
  return {
    current_page: p?.currentPage ?? 1,
    last_visible_page: p?.lastPage ?? 1,
    has_next_page: !!p?.hasNextPage,
  };
}

/* ---------------- Public AniList functions ---------------- */
export async function airingAnime(page = 1) {
  const d = await gql(LIST_QUERY, {
    page, perPage: 24, type: 'ANIME', status: 'RELEASING', sort: ['POPULARITY_DESC'],
  });
  return { data: d.Page.media.map(normalize), pagination: pageInfo(d.Page.pageInfo) };
}

export async function publishingManga(page = 1) {
  const d = await gql(LIST_QUERY, {
    page, perPage: 24, type: 'MANGA', status: 'RELEASING', sort: ['POPULARITY_DESC'],
  });
  return { data: d.Page.media.map(normalize), pagination: pageInfo(d.Page.pageInfo) };
}

export async function searchList({ q, type, status, year, orderBy, sort, page = 1 }, kind) {
  const variables = {
    page, perPage: 24,
    search: String(q || '').trim().slice(0, 64) || undefined,
    type: kind === 'manga' ? 'MANGA' : 'ANIME',
    status: status ? STATUS[status] : undefined,
    seasonYear: year ? Number.parseInt(year, 10) || undefined : undefined,
    format: type ? FORMAT[type] : undefined,
    sort: toSort(orderBy, sort),
  };
  Object.keys(variables).forEach((k) => variables[k] === undefined && delete variables[k]);
  const d = await gql(LIST_QUERY, variables);
  return { data: d.Page.media.map(normalize), pagination: pageInfo(d.Page.pageInfo) };
}

export async function detail(id, kind) {
  const d = await gql(DETAIL_QUERY, {
    id: Number.parseInt(id, 10) || 1,
    type: kind === 'manga' ? 'MANGA' : 'ANIME',
  });
  return { data: d.Media ? normalize(d.Media) : null };
}

export async function seasonal(season, year, page = 1) {
  const d = await gql(LIST_QUERY, {
    page, perPage: 24, type: 'ANIME',
    season: String(season).toUpperCase(), seasonYear: Number.parseInt(year, 10),
    sort: ['POPULARITY_DESC'],
  });
  return { data: d.Page.media.map(normalize), pagination: pageInfo(d.Page.pageInfo) };
}