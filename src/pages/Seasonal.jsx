import { useEffect, useState } from 'react';
import { getSeasonal } from '../api';
import { MediaGrid, GridSkeleton, ErrorState } from '../components/Grid';

const SEASONS = [
  { value: 'winter', label: 'Winter', emoji: '❄️' },
  { value: 'spring', label: 'Spring', emoji: '🌸' },
  { value: 'summer', label: 'Summer', emoji: '☀️' },
  { value: 'fall', label: 'Fall', emoji: '🍂' },
];

function currentSeasonMeta() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const season = m <= 3 ? 'winter' : m <= 6 ? 'spring' : m <= 9 ? 'summer' : 'fall';
  return { season, year: y };
}

export default function Seasonal() {
  const { season, year } = currentSeasonMeta();
  const [selSeason, setSelSeason] = useState(season);
  const [selYear, setSelYear] = useState(year);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const years = [];
  for (let y = 2026; y >= 2018; y--) years.push(y);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getSeasonal(selSeason, selYear)
      .then((res) => active && setData(res?.data ?? []))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selSeason, selYear]);

  const currentMeta = currentSeasonMeta();
  const isCurrent = selSeason === currentMeta.season && selYear === currentMeta.year;

  return (
    <div className="page-seasonal fade-in">
      <h1 className="page-title">Seasonal calendar</h1>
      <p className="muted page-sub">Browse every anime that aired each season, all the way back.</p>

      <div className="seasonal-picker">
        <div className="chips">
          {SEASONS.map((s) => (
            <button
              key={s.value}
              className={`chip${selSeason === s.value ? ' active' : ''}`}
              onClick={() => setSelSeason(s.value)}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
        <select
          className="year-select"
          value={selYear}
          onChange={(e) => setSelYear(Number(e.target.value))}
          aria-label="Year"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="section-head" style={{ marginTop: 28 }}>
        <h2 className="section-title">
          <span className="dot">●</span> {SEASONS.find((s) => s.value === selSeason)?.label} {selYear}
          {isCurrent && <span className="chip" style={{ marginLeft: 10 }}>NOW</span>}
        </h2>
      </div>

      {loading && <GridSkeleton />}
      {error && !loading && <ErrorState message={error} onRetry={() => window.location.reload()} />}
      {!loading && !error && (
        data.length ? (
          <MediaGrid items={data} kind="anime" />
        ) : (
          <p className="muted center" style={{ padding: '40px 0' }}>No titles found for this season.</p>
        )
      )}
    </div>
  );
}