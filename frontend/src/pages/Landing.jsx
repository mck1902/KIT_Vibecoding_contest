/* 2026-04-08 수정: 기존 App.js 내용을 분리하여 랜딩 페이지 전용 컴포넌트로 구성했습니다. */
import React from 'react';
import Hero from '../components/common/Hero';
import Features from '../components/common/Features';

const Landing = () => {
  return (
    <>
      <Hero />
      <Features />
    </>
  );
};

export default Landing;
