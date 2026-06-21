import React from 'react';
import { SkillUpgrades } from '../types/game';
import { Shield, Sparkles, Zap, Minimize2, Coins, ArrowUpCircle, X } from 'lucide-react';
import { soundSynth } from '../services/soundSynth';

interface UpgradesPanelProps {
  upgrades: SkillUpgrades;
  credits: number;
  onUpgradePurchase: (trait: keyof SkillUpgrades, cost: number) => void;
  onClose: () => void;
}

export const UpgradesPanel: React.FC<UpgradesPanelProps> = ({
  upgrades,
  credits,
  onUpgradePurchase,
  onClose
}) => {
  const getCost = (level: number) => {
    if (level >= 5) return 0;
    return (level + 1) * 300;
  };

  const handlePurchase = (trait: keyof SkillUpgrades) => {
    const currentLevel = upgrades[trait];
    const cost = getCost(currentLevel);
    if (cost > 0 && credits >= cost) {
      soundSynth.playCollect();
      onUpgradePurchase(trait, cost);
    } else {
      soundSynth.playHit(); // play error buzzer sound
    }
  };

  const traitsConfig = [
    {
      key: 'magnetRadius' as keyof SkillUpgrades,
      title: 'Magnet Range',
      description: 'Increases the collection swell radius to attract distant crystals.',
      icon: <Sparkles size={18} style={{ color: 'var(--neon-cyan)' }} />,
      color: 'var(--neon-cyan)'
    },
    {
      key: 'laserFireRate' as keyof SkillUpgrades,
      title: 'Weapon Cadence',
      description: 'Increases laser fire velocity rate during shield dome operations.',
      icon: <Zap size={18} style={{ color: 'var(--neon-pink)' }} />,
      color: 'var(--neon-pink)'
    },
    {
      key: 'maxIntegrity' as keyof SkillUpgrades,
      title: 'Structural Armor',
      description: 'Increases the starting core integrity buffer by +20 HP per level.',
      icon: <Shield size={18} style={{ color: 'var(--neon-green)' }} />,
      color: 'var(--neon-green)'
    },
    {
      key: 'shieldEfficiency' as keyof SkillUpgrades,
      title: 'Shield Conduction',
      description: 'Reduces energy consumption rate when projecting the defense dome.',
      icon: <Minimize2 size={18} style={{ color: 'var(--neon-yellow)' }} />,
      color: 'var(--neon-yellow)'
    }
  ];

  return (
    <div className="center-overlay-container" style={{ pointerEvents: 'auto' }}>
      <div className="glass-panel menu-card" style={{ maxWidth: '520px', animation: 'none', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 className="text-glow-cyan" style={{ textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Coins size={20} /> Grid Upgrades
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ff0055', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Coins size={16} style={{ color: 'var(--neon-yellow)' }} />
          <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>AVAILABLE CREDITS:</span>
          <strong style={{ color: 'var(--neon-yellow)', fontFamily: 'monospace', fontSize: '1.05rem' }}>{credits} CR</strong>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {traitsConfig.map(trait => {
            const currentLevel = upgrades[trait.key];
            const cost = getCost(currentLevel);
            const isMax = currentLevel >= 5;
            const canAfford = credits >= cost;

            return (
              <div 
                key={trait.key} 
                className="glass-panel" 
                style={{
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  borderColor: isMax ? 'rgba(0, 255, 255, 0.2)' : 'var(--glass-border)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px', borderRadius: '8px' }}>
                      {trait.icon}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>{trait.title}</h4>
                      <span style={{ fontSize: '0.65rem', color: trait.color, fontWeight: 600, textTransform: 'uppercase' }}>
                        Level {currentLevel} / 5
                      </span>
                    </div>
                  </div>

                  {!isMax ? (
                    <button 
                      className={`neon-btn ${canAfford ? 'neon-btn-primary' : ''}`}
                      onClick={() => handlePurchase(trait.key)}
                      style={{ padding: '6px 12px', fontSize: '0.72rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      disabled={!canAfford}
                    >
                      <ArrowUpCircle size={12} /> {cost} CR
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: 'var(--neon-green)', fontWeight: 700, textTransform: 'uppercase', padding: '6px' }}>
                      MAXED
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.3 }}>
                  {trait.description}
                </p>

                {/* Level blocks progress bar */}
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div 
                      key={idx} 
                      style={{
                        height: '6px',
                        flexGrow: 1,
                        background: idx < currentLevel ? trait.color : 'rgba(255,255,255,0.08)',
                        borderRadius: '2px',
                        boxShadow: idx < currentLevel ? `0 0 8px ${trait.color}44` : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
export default UpgradesPanel;
