import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function SpotDiffEditorPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/games', { replace: true });
  }, [navigate]);
  return null;
}
