import React from 'react';
import { Award, Lock, Unlock, X } from 'lucide-react';
import { Achievement } from '../types/game';

interface AchievementsPanelProps {
  achievements: Achievement[];
  onClose: () => void;
}

export const AchievementsPanel: React.FC<AchievementsPanelProps> = ({ achievements, onClose }) => {
  return (
    <div className="center-overlay-container" style={{ pointerEvents: 'auto' }}>
      <div className="glass-panel menu-card" style={{ maxWidth: '480px', animation: 'none', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="text-glow-cyan" style={{ textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={20} /> Hall of Trophies
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ff0055', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto', paddingRight: '6px' }}>
          {achievements.map(ach => {
            const percent = Math.min(100, Math.round((ach.progress / ach.target) * 100));
            return (
              <div 
                key={ach.id} 
                className="glass-panel" 
                style={{
                  padding: '12px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  borderColor: ach.unlocked ? 'rgba(0, 255, 255, 0.25)' : 'var(--glass-border)',
                  background: ach.unlocked ? 'rgba(0, 255, 255, 0.03)' : 'var(--glass-bg)'
                }}
              >
                {/* Lock/Unlock Icon */}
                <div style={{
                  background: ach.unlocked ? 'rgba(0, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${ach.unlocked ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.1)'}`,
                  color: ach.unlocked ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.3)',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {ach.unlocked ? <Unlock size={16} /> : <Lock size={16} />}
                </div>

                <div style={{ flexGrow: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: ach.unlocked ? 'var(--neon-cyan)' : 'white' }}>
                      {ach.title}
                    </h4>
                    {ach.unlocked && ach.unlockedAt && (
                      <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                        unlocked
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.55)', margin: '2px 0 6px 0', lineHeight: 1.3 }}>
                    {ach.description}
                  </p>
                  
                  {/* Progress Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.06)', height: '4px', flexGrow: 1, borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ 
                        background: ach.unlocked ? 'var(--neon-cyan)' : 'var(--neon-pink)', 
                        height: '100%', 
                        width: `${percent}%` 
                      }} />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', minWidth: '40px', textAlign: 'right' }}>
                      {ach.progress}/{ach.target}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
export default AchievementsPanel;
