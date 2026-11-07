'use client';

import { useId } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { StudyDay } from '@/lib/study-activity';

export type QuizAttempt = {
  id: string;
  course_id: string;
  title: string;
  score: number;
  submitted_at: string;
  kind: 'default' | 'named';
};

const activityConfig = { count: { label: 'Bài đã hoàn thành', color: '#36765c' } } satisfies ChartConfig;
const scoreConfig = { score: { label: 'Điểm quiz', color: '#518363' } } satisfies ChartConfig;
const progressConfig = {
  progress: { label: 'Đã hoàn thành', color: '#36765c' },
  track: { label: 'Tổng số bài bắt buộc', color: '#e7eee4' },
} satisfies ChartConfig;
const animation = {
  isAnimationActive: 'auto',
  animationDuration: 550,
  animationEasing: 'ease-out',
} as const;
const chartTick = { fill: '#5c7165', fontSize: 11 };

export function StudyRhythmChart({ days }: { days: StudyDay[] }) {
  return (
    <figure className="study-chart-figure">
      <ChartContainer config={activityConfig} className="study-chart-rhythm" initialDimension={{ width: 200, height: 142 }}>
        <LineChart data={days} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#e7eee4" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={chartTick} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={chartTick} width={28} tickCount={4} />
          <ChartTooltip content={<ChartTooltipContent
            className="study-chart-tooltip"
            labelFormatter={(_, entries) => entries[0]?.payload.date}
            formatter={value => <span>{String(value)} bài hoàn thành</span>}
          />} />
          <Line
            type="monotone"
            dataKey="count"
            stroke="var(--color-count)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--color-count)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            {...animation}
          />
        </LineChart>
      </ChartContainer>
      <figcaption className="study-chart-legend">
        <span className="study-chart-dot" aria-hidden="true" /> Số bài đã hoàn thành
        <span className="sr-only">{days.map(day => `${day.date}, ${day.count} bài`).join(' · ')}</span>
      </figcaption>
    </figure>
  );
}

export function QuizScoresChart({
  history,
  courses,
}: {
  history: QuizAttempt[];
  courses: { id: string; title: string }[];
}) {
  const headingId = useId();
  const titles = new Map(courses.map(course => [course.id, course.title]));
  const latest = new Map<string, QuizAttempt>();
  // Lịch sử được sắp xếp từ lượt nộp mới nhất.
  for (const attempt of history) {
    if (!latest.has(attempt.course_id)) latest.set(attempt.course_id, attempt);
    if (latest.size === 6) break;
  }
  const scores = Array.from(latest.values(), attempt => ({
    ...attempt,
    courseTitle: titles.get(attempt.course_id) ?? attempt.title,
  }));
  const height = 38 + 36 * scores.length;

  return (
    <section className="panel quiz-score-chart" aria-labelledby={headingId}>
      <h2 id={headingId}>Điểm quiz gần nhất theo khóa học</h2>
      <p>Tối đa 6 khóa có lượt nộp mới nhất, tính trên thang 100 điểm.</p>
      <figure className="study-chart-figure">
        <figcaption className="sr-only">
          {scores.map(score => `${score.courseTitle}, ${score.score}/100 điểm`).join(' · ')}
        </figcaption>
        <ChartContainer config={scoreConfig} className="study-chart-scores" style={{ height }} initialDimension={{ width: 320, height }}>
          <BarChart data={scores} layout="vertical" margin={{ top: 6, right: 30, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e7eee4" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={chartTick} />
            <YAxis
              type="category"
              dataKey="courseTitle"
              width={123}
              axisLine={false}
              tickLine={false}
              tick={chartTick}
              tickFormatter={(title: string) => {
                const characters = Array.from(title);
                return characters.length > 17 ? characters.slice(0, 16).join('').trimEnd() + '…' : title;
              }}
            />
            <ChartTooltip
              cursor={{ fill: '#f0f5ef' }}
              content={<ChartTooltipContent
                className="study-chart-tooltip"
                hideLabel
                formatter={(value, _, item) => (
                  <>
                    <strong>{item.payload.title}</strong>
                    <span>{String(value)}/100 điểm</span>
                  </>
                )}
              />}
            />
            <Bar dataKey="score" fill="var(--color-score)" radius={[0, 5, 5, 0]} maxBarSize={22} {...animation}>
              <LabelList dataKey="score" position="right" fill="#3b5b4b" fontSize={11} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </figure>
    </section>
  );
}

export function CourseProgressCard({ lessons }: { lessons: { required: boolean | number; completed: boolean }[] }) {
  const required = lessons.filter(lesson => lesson.required);
  const completed = required.filter(lesson => lesson.completed).length;
  const percent = required.length ? Math.round(completed / required.length * 100) : 0;

  return (
    <section className="panel course-progress-card">
      <h3>Tiến độ khóa học</h3>
      {required.length ? (
        <>
          <div className="course-progress-ring">
            <ChartContainer config={progressConfig} aria-hidden="true" initialDimension={{ width: 140, height: 140 }}>
              <PieChart accessibilityLayer={false} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={[{ value: 100 }]} dataKey="value" innerRadius="81%" outerRadius="100%"
                  fill="var(--color-track)" stroke="none" rootTabIndex={-1} isAnimationActive={false}
                />
                {completed > 0 && (
                  <Pie
                    data={[{ value: completed }]} dataKey="value" innerRadius="81%" outerRadius="100%"
                    startAngle={90} endAngle={90 - 360 * completed / required.length}
                    fill="var(--color-progress)" stroke="none" rootTabIndex={-1} {...animation}
                  />
                )}
              </PieChart>
            </ChartContainer>
            <strong>{percent}%</strong>
          </div>
          <p>{completed}/{required.length} bài bắt buộc đã hoàn thành</p>
        </>
      ) : <p>Khóa học chưa có bài bắt buộc.</p>}
    </section>
  );
}
