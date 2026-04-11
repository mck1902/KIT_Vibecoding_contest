/* frontend/src/api/client.js 
 * 공통 Fetch/Axios 인스턴스를 관리합니다.
 */

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

export const fetchHealth = async () => {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    console.log('Health Check:', data);
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};
