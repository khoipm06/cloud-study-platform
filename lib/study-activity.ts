import { zonedDay } from './planning';

export type StudyDay = { label: string; date: string; count: number };

const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const studyZone = 'Asia/Ho_Chi_Minh';

export function studyWeek(activity: { created_at: string }[], now = new Date()) {
  const today = new Date(zonedDay(now, studyZone) + 'T00:00:00Z');
  const counts = new Map<string, number>();
  for (const entry of activity) {
    const completedAt = new Date(entry.created_at);
    if (Number.isNaN(completedAt.getTime())) continue;
    const key = zonedDay(completedAt, studyZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const days: StudyDay[] = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - 6 + index);
    return {
      label: weekday.format(day).replace('Thứ ', 'T'),
      date: shortDate.format(day),
      count: counts.get(day.toISOString().slice(0, 10)) ?? 0,
    };
  });
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const weekCount = days.slice(-1 - daysSinceMonday).reduce((total, day) => total + day.count, 0);
  return { days, weekCount };
}
