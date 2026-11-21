export type Mood = 'happy' | 'calm' | 'sad'

interface Props {
  mood: Mood
  /** Меняется при каждой отметке — персонаж подпрыгивает от радости. */
  cheerKey: number
}

/**
 * Комната в изометрии и персонаж. Своя простая графика из фигур:
 * стены, окно, картина, диван, ковёр, растение.
 */
export function Room({ mood, cheerKey }: Props) {
  const mouth =
    mood === 'happy' ? 'M-6 -58 Q0 -51 6 -58' : mood === 'sad' ? 'M-6 -53 Q0 -59 6 -53' : 'M-5 -55 L5 -55'
  return (
    <svg className="room" viewBox="0 -14 320 266" role="img" aria-label={`Гостиная, персонаж ${moodLabel(mood)}`}>
      {/* стены */}
      <polygon points="20,180 20,60 160,-10 160,110" fill="var(--wall-left)" />
      <polygon points="160,110 160,-10 300,60 300,180" fill="var(--wall-right)" />
      {/* плинтус */}
      <polygon points="20,180 20,174 160,104 160,110" fill="var(--trim)" />
      <polygon points="160,110 160,104 300,174 300,180" fill="var(--trim)" />
      {/* пол */}
      <polygon points="160,110 300,180 160,250 20,180" fill="var(--floor)" />
      <path d="M90 145 L230 215 M55 162 L195 232 M125 127 L265 197" stroke="var(--floor-line)" strokeWidth="1" />

      {/* окно на левой стене */}
      <polygon points="48,118 48,72 112,40 112,86" fill="var(--sky)" stroke="var(--frame)" strokeWidth="4" />
      <line x1="80" y1="56" x2="80" y2="102" stroke="var(--frame)" strokeWidth="3" />
      <polygon points="44,122 44,116 116,80 116,86" fill="var(--frame)" />

      {/* картина на правой стене */}
      <polygon points="200,62 200,30 252,56 252,88" fill="var(--art-bg)" stroke="var(--frame)" strokeWidth="3" />
      <circle cx="226" cy="58" r="8" fill="var(--art-sun)" />

      {/* ковёр */}
      <ellipse cx="160" cy="190" rx="72" ry="34" fill="var(--rug)" />
      <ellipse cx="160" cy="190" rx="56" ry="25" fill="none" stroke="var(--rug-line)" strokeWidth="2" strokeDasharray="4 4" />

      {/* диван у левой стены */}
      <polygon points="40,178 40,150 100,120 100,148" fill="var(--sofa-dark)" />
      <polygon points="40,178 100,148 122,159 62,189" fill="var(--sofa)" />
      <polygon points="62,189 122,159 122,170 62,200" fill="var(--sofa-dark)" />
      <polygon points="40,178 62,189 62,200 40,189" fill="var(--sofa-darker)" />

      {/* растение справа */}
      <g transform="translate(262 186)">
        <polygon points="-12,-16 12,-16 9,0 -9,0" fill="var(--pot)" />
        <ellipse cx="-8" cy="-30" rx="9" ry="16" fill="var(--leaf)" transform="rotate(-25 -8 -30)" />
        <ellipse cx="8" cy="-32" rx="9" ry="17" fill="var(--leaf-2)" transform="rotate(20 8 -32)" />
        <ellipse cx="0" cy="-40" rx="8" ry="18" fill="var(--leaf)" />
      </g>

      {/* персонаж */}
      <g transform="translate(165 200)">
        <ellipse cx="0" cy="0" rx="20" ry="7" fill="var(--shadow)" />
        <g key={cheerKey} className={`person ${cheerKey ? 'cheer' : ''} ${mood}`}>
          {/* ноги */}
          <rect x="-9" y="-26" width="7" height="26" rx="3" fill="var(--pants)" />
          <rect x="2" y="-26" width="7" height="26" rx="3" fill="var(--pants)" />
          {/* туловище */}
          <rect x="-14" y="-52" width="28" height="30" rx="10" fill="var(--shirt)" />
          {/* руки */}
          {mood === 'happy' ? (
            <>
              <rect x="-24" y="-66" width="7" height="22" rx="3.5" fill="var(--skin)" transform="rotate(-30 -20 -48)" />
              <rect x="17" y="-66" width="7" height="22" rx="3.5" fill="var(--skin)" transform="rotate(30 20 -48)" />
            </>
          ) : (
            <>
              <rect x="-21" y="-50" width="7" height="22" rx="3.5" fill="var(--skin)" />
              <rect x="14" y="-50" width="7" height="22" rx="3.5" fill="var(--skin)" />
            </>
          )}
          {/* голова */}
          <circle cx="0" cy="-64" r="13" fill="var(--skin)" />
          <path d="M-13 -66 Q-12 -80 0 -79 Q13 -80 13 -66 Q8 -73 0 -72 Q-8 -73 -13 -66Z" fill="var(--hair)" />
          <circle cx="-5" cy="-63" r="1.6" fill="var(--ink)" />
          <circle cx="5" cy="-63" r="1.6" fill="var(--ink)" />
          <path d={mouth} stroke="var(--ink)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
        {/* облачко настроения */}
        <g transform="translate(24 -96)">
          <ellipse cx="0" cy="0" rx="14" ry="11" fill="var(--bubble)" />
          <circle cx="-9" cy="12" r="3" fill="var(--bubble)" />
          <text x="0" y="5" textAnchor="middle" fontSize="13">
            {mood === 'happy' ? '♥' : mood === 'sad' ? '☁' : '♪'}
          </text>
        </g>
      </g>
    </svg>
  )
}

function moodLabel(m: Mood) {
  return m === 'happy' ? 'радуется' : m === 'sad' ? 'грустит' : 'спокоен'
}
