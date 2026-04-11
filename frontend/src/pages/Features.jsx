import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BrainCircuit, Sparkles, ShieldCheck, Award,
  ChevronRight, Target, BarChart3, Bell, Layout,
  Zap, Eye, TrendingUp
} from 'lucide-react';

/* ───────────────────────────────────────────
   Section 1. Hero
─────────────────────────────────────────── */
const HeroSection = () => (
  <section className="relative pt-36 pb-20 px-6 z-10 text-center">
    <div className="max-w-4xl mx-auto flex flex-col items-center gap-6">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold backdrop-blur-sm">
        <Zap className="w-4 h-4" />
        EduWatch 핵심 기술
      </div>
      <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight">
        AI, 데이터, 그리고{' '}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
          개인정보 보호
        </span>
        <br />하나로 연결된 학습 플랫폼
      </h1>
      <p className="text-lg text-slate-400 max-w-2xl leading-relaxed break-keep">
        온디바이스 비전 AI부터 AI 기반 RAG 분석까지 —
        EduWatch가 어떻게 집중력을 측정하고 학습을 개선하는지 살펴보세요.
      </p>
    </div>
  </section>
);

/* ───────────────────────────────────────────
   Section 2. 핵심 기능 4개 카드
─────────────────────────────────────────── */
const CORE_FEATURES = [
  {
    icon: BrainCircuit,
    title: '온디바이스 비전 AI',
    subtitle: '서버로 영상을 보내지 않는 완전한 프라이버시 보호',
    color: 'blue',
    badge: 'TensorFlow.js',
    steps: ['웹캠 영상 캡처 (3초 간격)', 'MobileNet V3 Large 추론', '5단계 집중도 분류 출력'],
    detail: 'MobileNet V3 Large 전이학습 모델, AI Hub 공개 데이터 기반, F1-score 0.97',
  },
  {
    icon: Sparkles,
    title: 'AI RAG 분석',
    subtitle: '강의 자막 + 집중도 데이터를 결합한 맞춤형 학습 인사이트',
    color: 'purple',
    badge: 'GPT-4o-mini',
    steps: ['강의 자막 세그먼트 분석', '집중도 타임라인과 매핑', '컨텍스트 기반 코칭 생성'],
    detail: '세션당 ~$0.02, 수학 문제풀이 구간 집중도 저하 등 구체적 원인 분석',
  },
  {
    icon: ShieldCheck,
    title: '탭 이탈 감지',
    subtitle: '강의 화면을 벗어나는 순간 자동으로 기록',
    color: 'amber',
    badge: 'Page Visibility API',
    steps: ['Page Visibility API 모니터링', '이탈 횟수 & 총 시간 집계', '이탈 중 비집중 상태 자동 기록'],
    detail: '브라우저 표준 API 활용, 별도 설치 불필요, 실시간 경고 배너 표시',
  },
  {
    icon: Award,
    title: '게임화 진척도',
    subtitle: '목표 달성과 보상으로 학습 동기를 높이는 시스템',
    color: 'green',
    badge: 'Recharts',
    steps: ['세션별 집중도 점수 산출', '일일 목표 달성 현황 시각화', '주간 트렌드 & 성장 리포트'],
    detail: '7일 선형 차트, 목표 달성 배지, 지난주 대비 +12.5% 등 성장 지표 제공',
  },
];

const colorMap = {
  blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/20',   text: 'text-blue-400',   hover: 'hover:border-blue-500/50',   shadow: 'hover:shadow-[0_15px_30px_rgba(59,130,246,0.15)]',  badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', hover: 'hover:border-purple-500/50', shadow: 'hover:shadow-[0_15px_30px_rgba(168,85,247,0.15)]',  badge: 'bg-purple-500/10 text-purple-300 border-purple-500/20' },
  amber:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  text: 'text-amber-400',  hover: 'hover:border-amber-500/50',  shadow: 'hover:shadow-[0_15px_30px_rgba(245,158,11,0.15)]',  badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  green:  { bg: 'bg-green-500/10',  border: 'border-green-500/20',  text: 'text-green-400',  hover: 'hover:border-green-500/50',  shadow: 'hover:shadow-[0_15px_30px_rgba(34,197,94,0.15)]',   badge: 'bg-green-500/10 text-green-300 border-green-500/20' },
};

const CoreFeaturesSection = () => (
  <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
    <div className="text-center mb-14">
      <h2 className="text-3xl md:text-4xl font-bold mb-3">4가지 핵심 기능</h2>
      <p className="text-slate-400 text-lg break-keep">각 기능이 어떻게 작동하는지 단계별로 확인해 보세요.</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {CORE_FEATURES.map((f) => {
        const c = colorMap[f.color];
        return (
          <div
            key={f.title}
            className={`group relative rounded-3xl bg-slate-900/80 backdrop-blur-sm border border-white/10 ${c.hover} ${c.shadow} transition-all duration-500 hover:-translate-y-1 p-8 flex flex-col gap-6`}
          >
            {/* 아이콘 + 뱃지 */}
            <div className="flex items-start justify-between">
              <div className={`w-14 h-14 rounded-2xl ${c.bg} border ${c.border} flex items-center justify-center`}>
                <f.icon className={`w-7 h-7 ${c.text}`} />
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${c.badge}`}>
                {f.badge}
              </span>
            </div>

            {/* 제목 */}
            <div>
              <h3 className="text-xl font-bold mb-1">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed break-keep">{f.subtitle}</p>
            </div>

            {/* 3단계 플로우 */}
            <div className="flex flex-col gap-2">
              {f.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full ${c.bg} border ${c.border} flex items-center justify-center text-xs font-bold ${c.text} shrink-0`}>
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-300">{step}</span>
                  {i < f.steps.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-slate-600 ml-auto shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* 세부 정보 */}
            <p className="text-xs text-slate-500 border-t border-white/5 pt-4 leading-relaxed break-keep">
              {f.detail}
            </p>
          </div>
        );
      })}
    </div>
  </section>
);

/* ───────────────────────────────────────────
   Section 3. AI 집중도 5단계 상태
─────────────────────────────────────────── */
const ATTENTION_STATES = [
  { label: '집중 + 흥미', color: '#22c55e', bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  desc: '학습에 완전히 몰입하여 능동적으로 참여하는 상태' },
  { label: '집중 + 차분', color: '#3b82f6', bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   desc: '안정적으로 집중하며 내용을 수용하는 이상적인 상태' },
  { label: '비집중 + 차분', color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/30',  text: 'text-amber-400',  desc: '주의가 분산되었으나 각성 수준은 유지되는 상태' },
  { label: '비집중 + 지루', color: '#f97316', bg: 'bg-orange-500/10',border: 'border-orange-500/30', text: 'text-orange-400', desc: '집중도가 낮고 학습 동기가 떨어진 위험 상태' },
  { label: '졸음', color: '#ef4444',          bg: 'bg-red-500/10',   border: 'border-red-500/30',    text: 'text-red-400',    desc: '각성 수준이 매우 낮아 즉각적인 휴식이 필요한 상태' },
];

const AttentionStatesSection = () => (
  <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
    <div className="rounded-3xl bg-slate-900/60 border border-white/10 p-10 md:p-14">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold mb-3">AI가 분류하는 집중도 5단계</h2>
        <p className="text-slate-400 text-lg break-keep">
          MobileNet V3 Large 모델이 실시간으로 표정과 자세를 분석합니다.
        </p>
        <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
          <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full">모델: MobileNet V3 Large</span>
          <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full">F1-score: 0.97</span>
          <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full">데이터: AI Hub (Apache 2.0)</span>
          <span className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full">샘플링: 3초 간격</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {ATTENTION_STATES.map((s, i) => (
          <div
            key={s.label}
            className={`group relative rounded-2xl ${s.bg} border ${s.border} p-5 flex flex-col gap-3 hover:-translate-y-1 transition-transform duration-300`}
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}80` }} />
              <span className={`text-xs font-bold ${s.text}`}>단계 {i + 1}</span>
            </div>
            <p className="font-semibold text-sm text-slate-100">{s.label}</p>
            <p className="text-xs text-slate-400 leading-relaxed break-keep">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* 색상 스펙트럼 바 */}
      <div className="mt-10">
        <div className="flex rounded-full overflow-hidden h-3 shadow-lg">
          {ATTENTION_STATES.map(s => (
            <div key={s.color} className="flex-1" style={{ backgroundColor: s.color }} />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>최고 집중</span>
          <span>최저 집중</span>
        </div>
      </div>
    </div>
  </section>
);

/* ───────────────────────────────────────────
   Section 4. 학생 vs 학부모 기능 비교
─────────────────────────────────────────── */
const STUDENT_FEATURES = [
  { icon: Target,    text: '실시간 집중도 추적' },
  { icon: Award,     text: '게임화된 진척도 리포트' },
  { icon: Layout,    text: '맞춤형 성취도 향상 팁' },
  { icon: ShieldCheck, text: '일일 집중력 챌린지' },
];

const PARENT_FEATURES = [
  { icon: BarChart3, text: '상세 데이터 분석 대시보드' },
  { icon: TrendingUp, text: '장기 학습 진척도 모니터링' },
  { icon: Sparkles,  text: 'AI 인사이트 제공' },
  { icon: Bell,      text: '선제적 알림 & 실시간 업데이트' },
];

const ComparisonSection = () => (
  <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
    <div className="text-center mb-14">
      <h2 className="text-3xl md:text-4xl font-bold mb-3">역할별 맞춤 기능</h2>
      <p className="text-slate-400 text-lg break-keep">학생과 학부모, 각자의 필요에 최적화된 경험을 제공합니다.</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* 학생 */}
      <div className="rounded-3xl bg-slate-900/80 border border-white/10 hover:border-blue-500/40 hover:shadow-[0_15px_30px_rgba(59,130,246,0.12)] transition-all duration-500 p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Eye className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold">학생용</h3>
            <p className="text-sm text-slate-400">학습에 게임 요소를 더해 몰입감 있는 공부 환경</p>
          </div>
        </div>
        <ul className="space-y-3">
          {STUDENT_FEATURES.map((f, i) => (
            <li key={i} className="flex items-center gap-3 text-slate-300 group/item">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/10 group-hover/item:border-blue-500/30 transition-colors">
                <f.icon className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-sm font-medium group-hover/item:text-white transition-colors">{f.text}</span>
            </li>
          ))}
        </ul>
        <Link
          to="/student"
          className="mt-auto py-3 bg-white/5 hover:bg-blue-600 text-white font-bold rounded-xl border border-white/10 hover:border-blue-500 transition-all duration-300 flex items-center justify-center gap-2 text-sm"
        >
          학생 모드 체험 <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* 학부모 */}
      <div className="rounded-3xl bg-slate-900/80 border border-white/10 hover:border-purple-500/40 hover:shadow-[0_15px_30px_rgba(168,85,247,0.12)] transition-all duration-500 p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold">학부모용</h3>
            <p className="text-sm text-slate-400">자녀의 학습 패턴을 깊이 이해하고 든든하게 지원</p>
          </div>
        </div>
        <ul className="space-y-3">
          {PARENT_FEATURES.map((f, i) => (
            <li key={i} className="flex items-center gap-3 text-slate-300 group/item">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/10 group-hover/item:border-purple-500/30 transition-colors">
                <f.icon className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-sm font-medium group-hover/item:text-white transition-colors">{f.text}</span>
            </li>
          ))}
        </ul>
        <Link
          to="/parent"
          className="mt-auto py-3 bg-white/5 hover:bg-purple-600 text-white font-bold rounded-xl border border-white/10 hover:border-purple-500 transition-all duration-300 flex items-center justify-center gap-2 text-sm"
        >
          학부모 모드 체험 <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  </section>
);


/* ───────────────────────────────────────────
   Main Export
─────────────────────────────────────────── */
const Features = () => (
  <div className="min-h-screen font-sans bg-slate-950 text-slate-100 overflow-hidden relative">
    {/* 앰비언트 글로우 */}
    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/15 rounded-full blur-[120px] pointer-events-none z-0" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/15 rounded-full blur-[120px] pointer-events-none z-0" />

    <HeroSection />
    <CoreFeaturesSection />
    <AttentionStatesSection />
    <ComparisonSection />
  </div>
);

export default Features;
