import React from 'react';
import { useNavigate } from 'react-router-dom';
import heroIllustration from '../assets/hero_illustration.png';
import studentBanner from '../assets/student_card_banner.png';
import parentBanner from '../assets/parent_card_banner.png';

{/* 
  수정일자: 2026-04-10
  수정내용:
  - 첨부된 FocusAI 레퍼런스 디자인을 바탕으로 라이트 테마 기반의 레이아웃으로 전면 리팩토링함.
  - 상단 헤더, 그라데이션 히어로 영역, 오버랩된 2개의 화이트 카드로 구조 완전 개편.
*/}

const Landing = () => {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen font-sans bg-slate-50 relative overflow-x-hidden">

            {/* Hero Section (Gradient Background) */}
            {/* Background gradient from dark blue to purple, simulating the reference image */}
            <section className="pt-8 pb-48 px-6 bg-gradient-to-r from-[#0f172a] via-[#1e40af] to-[#c084fc] relative z-0">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12">
                    <div className="md:w-1/2 flex flex-col gap-6 text-white text-left">
                        <h1 className="font-extrabold leading-[1.2] tracking-tight flex flex-col gap-2">
                            <span className="text-2xl md:text-3xl lg:text-4xl text-white whitespace-nowrap">
                                비전 AI 학습 분석으로
                            </span>
                            <span className="text-4xl md:text-5xl lg:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 py-2 break-keep">
                                집중력을 마스터하세요
                            </span>
                        </h1>
                        <p className="text-lg md:text-xl text-blue-100 max-w-xl leading-relaxed break-keep font-medium">
                            실시간 집중도 추적, 맞춤형 학습 경로 및 데이터 기반 분석을 통해 자녀 또는 본인의 잠재력을 일깨우고 성장을 지원합니다.
                        </p>
                        <div className="mt-4">
                            <button onClick={() => navigate('/login')} className="px-8 py-4 bg-[#1e3a8a] hover:bg-[#172554] text-white font-bold rounded-lg shadow-lg transition-all transform hover:-translate-y-1">
                                지금 시작하기
                            </button>
                        </div>
                    </div>

                    <div className="md:w-1/2 flex justify-center mt-12 md:mt-0 relative">
                        {/* High-tech stylized hero illustration */}
                        <img
                            src={heroIllustration}
                            alt="AI Learning Concept"
                            className="w-full max-w-lg object-contain mix-blend-screen opacity-90 hover:opacity-100 transition-opacity duration-500 animate-fade-in"
                            style={{
                                WebkitMaskImage: "radial-gradient(ellipse at center, black 45%, transparent 75%)",
                                maskImage: "radial-gradient(ellipse at center, black 45%, transparent 75%)"
                            }}
                        />
                    </div>
                </div>
            </section>

            {/* Overlapping Cards Section */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 -mt-32 pb-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* Student Card */}
                    <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden transform transition duration-500 hover:-translate-y-2 hover:shadow-[0_30px_50px_-15px_rgba(59,130,246,0.3)]">
                        {/* Top Banner with Image */}
                        <div className="h-48 w-full bg-[#f0f9ff] relative overflow-hidden border-b border-slate-100">
                            <img src={studentBanner} alt="For Students" className="absolute inset-0 w-full h-full object-cover" />
                        </div>
                        {/* Content Body */}
                        <div className="p-8 flex flex-col flex-grow text-slate-800">
                            <ul className="space-y-5 mb-10 text-[15px] leading-relaxed break-keep flex-grow">
                                <li className="flex gap-3">
                                    <span className="text-blue-500 mt-1">•</span>
                                    <span><strong>실시간 집중도 추적:</strong> 공부하는 동안 집중력을 모니터링합니다.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-blue-500 mt-1">•</span>
                                    <span><strong>게임화된 진척도 리포트:</strong> 학습을 성취 기반 시스템으로 전환합니다.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-blue-500 mt-1">•</span>
                                    <span><strong>맞춤형 개선 팁:</strong> 집중력을 극대화하기 위한 실질적인 조언을 얻습니다.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-blue-500 mt-1">•</span>
                                    <span><strong>목표 설정 및 도전:</strong> 매일 집중 목표를 달성하며 자신에게 도전하세요.</span>
                                </li>
                            </ul>
                            <div className="mt-auto">
                                <button onClick={() => navigate('/login')} className="w-full py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold rounded-xl shadow-md transition-colors">
                                    학생 모드 탐색
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Parent Card */}
                    <div className="bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden transform transition duration-500 hover:-translate-y-2 hover:shadow-[0_30px_50px_-15px_rgba(30,58,138,0.3)]">
                        {/* Top Banner with Image */}
                        <div className="h-48 w-full bg-[#e0e7ff] relative overflow-hidden border-b border-slate-100">
                            <img src={parentBanner} alt="For Parents" className="absolute inset-0 w-full h-full object-cover" />
                        </div>
                        {/* Content Body */}
                        <div className="p-8 flex flex-col flex-grow text-slate-800">
                            <ul className="space-y-5 mb-10 text-[15px] leading-relaxed break-keep flex-grow">
                                <li className="flex gap-3">
                                    <span className="text-[#1e3a8a] mt-1">•</span>
                                    <span><strong>상세 분석 대시보드:</strong> 자녀의 학습 패턴에 대한 깊은 인사이트를 얻으세요.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#1e3a8a] mt-1">•</span>
                                    <span><strong>진척도 모니터링:</strong> 시간에 따른 집중력 및 학업 변화 추이를 추적합니다.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#1e3a8a] mt-1">•</span>
                                    <span><strong>실질적인 성장 인사이트:</strong> 최적의 학습 환경을 지원하는 방안을 파악합니다.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="text-[#1e3a8a] mt-1">•</span>
                                    <span><strong>선제적 알림 및 가이드:</strong> 선제적 피드백과 가이드로 학습 현황을 수시로 확인합니다.</span>
                                </li>
                            </ul>
                            <div className="mt-auto">
                                <button onClick={() => navigate('/login')} className="w-full py-4 bg-[#1e3a8a] hover:bg-[#1e40af] text-white font-bold rounded-xl shadow-md transition-colors">
                                    학부모 모드 탐색
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </section>

            {/* Simple Footer */}
            <footer className="py-8 px-6 border-t border-slate-200 mt-0 text-center text-slate-500 text-sm flex flex-col md:flex-row justify-between items-center max-w-6xl mx-auto">
                <div className="flex gap-6 mb-4 md:mb-0">
                    <a href="#" className="hover:text-slate-800">Contact</a>
                    <a href="#" className="hover:text-slate-800">Privacy Policy</a>
                    <a href="#" className="hover:text-slate-800">Terms of Service</a>
                </div>
                <div>
                    &copy; 2026 EduWatch. All rights reserved.
                </div>
            </footer>
        </div>
    );
};

export default Landing;
