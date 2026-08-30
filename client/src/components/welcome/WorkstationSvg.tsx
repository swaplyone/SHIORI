import React from 'react';

export const WorkstationSvg: React.FC<{ isDark: boolean; className?: string }> = ({ isDark, className = '' }) => {
  const strokeColor = isDark ? '#FFFFFF' : '#111111';
  const fillColor = isDark ? '#000000' : '#FFFFFF';
  const mutedStroke = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(17, 17, 17, 0.4)';
  const highlightStroke = isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(17, 17, 17, 0.85)';
  const gridStroke = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(17, 17, 17, 0.2)';

  return (
    <svg
      viewBox="0 0 900 700"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`w-full h-auto max-w-full select-none ${className}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Subtle glow filter for interactive elements */}
        <filter id="inkGlow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={strokeColor} floodOpacity="0.3" />
        </filter>
      </defs>

      {/* ========================================================================= */}
      {/* 1. FLOOR PEDESTAL & BOTANICAL VASE (Left-Back) */}
      {/* ========================================================================= */}
      <g className="pedestal-plant transition-transform duration-500 hover:scale-[1.01]">
        {/* Pedestal Box */}
        {/* Top Face */}
        <polygon
          points="200,430 250,400 290,425 240,455"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Left Face */}
        <polygon
          points="200,430 240,455 240,510 200,485"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Right Face */}
        <polygon
          points="240,455 290,425 290,480 240,510"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Ceramic Vase on Pedestal */}
        {/* Base Rim */}
        <ellipse cx="245" cy="425" rx="14" ry="7" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
        {/* Body */}
        <path
          d="M 231 425 C 220 395, 215 365, 235 345 C 242 338, 248 338, 255 345 C 275 365, 270 395, 259 425 Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Vase Neck & Mouth */}
        <ellipse cx="245" cy="342" rx="7" ry="3.5" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />

        {/* Tall Delicate Japanese Plum/Cherry Blossom Branch */}
        {/* Main Central Trunk */}
        <path
          d="M 245 340 Q 242 270, 248 200 Q 252 140, 245 80 Q 242 50, 245 20"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        {/* Side Boughs */}
        <path d="M 246 250 Q 220 220, 195 210 Q 180 205, 165 215" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M 247 220 Q 275 190, 310 180 Q 330 175, 345 185" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <path d="M 248 160 Q 225 135, 205 130 Q 190 125, 175 135" stroke={strokeColor} strokeWidth="1" strokeLinecap="round" />
        <path d="M 247 130 Q 270 105, 295 95 Q 315 90, 330 100" stroke={strokeColor} strokeWidth="1" strokeLinecap="round" />
        <path d="M 246 80 Q 230 60, 215 55" stroke={strokeColor} strokeWidth="0.8" strokeLinecap="round" />
        <path d="M 245 60 Q 260 40, 275 35" stroke={strokeColor} strokeWidth="0.8" strokeLinecap="round" />

        {/* Blossom Nodes & Little Leaves (Petal Clusters) */}
        {[
          { cx: 245, cy: 30 }, { cx: 275, cy: 35 }, { cx: 215, cy: 55 },
          { cx: 245, cy: 80 }, { cx: 295, cy: 95 }, { cx: 330, cy: 100 },
          { cx: 205, cy: 130 }, { cx: 175, cy: 135 }, { cx: 247, cy: 130 },
          { cx: 248, cy: 160 }, { cx: 275, cy: 190 }, { cx: 310, cy: 180 },
          { cx: 345, cy: 185 }, { cx: 220, cy: 220 }, { cx: 195, cy: 210 },
          { cx: 165, cy: 215 }, { cx: 246, cy: 250 }, { cx: 235, cy: 280 },
          { cx: 255, cy: 270 }, { cx: 260, cy: 230 }, { cx: 228, cy: 170 },
          { cx: 262, cy: 145 }, { cx: 230, cy: 100 }, { cx: 258, cy: 70 }
        ].map((node, i) => (
          <g key={i}>
            <circle cx={node.cx} cy={node.cy} r="2" fill={strokeColor} />
            <path
              d={`M ${node.cx - 3} ${node.cy} L ${node.cx + 3} ${node.cy} M ${node.cx} ${node.cy - 3} L ${node.cx} ${node.cy + 3}`}
              stroke={strokeColor}
              strokeWidth="0.75"
            />
          </g>
        ))}
      </g>

      {/* ========================================================================= */}
      {/* 2. ISOMETRIC DESK STRUCTURE (Center & Shelves) */}
      {/* ========================================================================= */}
      <g className="desk-structure">
        {/* Main Desktop Surface Planks (Top Slat Grid) */}
        {/* Desktop Thickness Top Face */}
        <polygon
          points="270,290 620,105 760,185 410,370"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Front Edge Thickness */}
        <polygon
          points="270,290 410,370 410,382 270,302"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Right Edge Thickness */}
        <polygon
          points="410,370 760,185 760,197 410,382"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Individual Wooden Slat Grooves on Desktop */}
        {[0.16, 0.33, 0.5, 0.67, 0.84].map((ratio, idx) => {
          const x1 = 270 + (410 - 270) * ratio;
          const y1 = 290 + (370 - 290) * ratio;
          const x2 = 620 + (760 - 620) * ratio;
          const y2 = 105 + (185 - 105) * ratio;
          return (
            <line
              key={idx}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={gridStroke}
              strokeWidth="1"
              strokeDasharray="4 2"
            />
          );
        })}

        {/* Left Leg Frame & Shelving Unit */}
        {/* Outer Front Left Pillar */}
        <line x1="275" y1="302" x2="275" y2="520" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
        {/* Outer Back Left Pillar */}
        <line x1="330" y1="260" x2="330" y2="475" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        {/* Inner Front Left Pillar */}
        <line x1="365" y1="355" x2="365" y2="570" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
        {/* Inner Back Left Pillar */}
        <line x1="420" y1="315" x2="420" y2="525" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />

        {/* Left Bottom Shelf */}
        <polygon
          points="275,505 330,470 420,520 365,555"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Left Middle Shelf */}
        <polygon
          points="275,410 330,375 420,425 365,460"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Books on Left Middle Shelf */}
        {/* Book 1 (Vertical) */}
        <polygon points="290,400 300,394 300,430 290,436" fill={fillColor} stroke={strokeColor} strokeWidth="1" />
        {/* Book 2 (Vertical) */}
        <polygon points="302,393 312,387 312,423 302,429" fill={fillColor} stroke={strokeColor} strokeWidth="1" />
        {/* Book 3 (Vertical) */}
        <polygon points="314,386 326,379 326,415 314,422" fill={fillColor} stroke={strokeColor} strokeWidth="1" />
        {/* Stacked Horizontal Books on Lower Shelf */}
        <polygon points="290,490 340,460 370,478 320,508" fill={fillColor} stroke={strokeColor} strokeWidth="1" />
        <polygon points="290,483 340,453 370,471 320,501" fill={fillColor} stroke={strokeColor} strokeWidth="1" />

        {/* Right Leg Frame & Shelving Unit */}
        {/* Front Right Outer Pillar */}
        <line x1="755" y1="197" x2="755" y2="415" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
        {/* Back Right Outer Pillar */}
        <line x1="625" y1="115" x2="625" y2="330" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        {/* Front Right Inner Pillar */}
        <line x1="665" y1="245" x2="665" y2="465" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        {/* Back Right Inner Pillar */}
        <line x1="535" y1="165" x2="535" y2="380" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />

        {/* Right Shelf Plate */}
        <polygon
          points="665,450 535,370 625,320 755,400"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Crossbar connecting bottom shelves */}
        <line x1="365" y1="550" x2="665" y2="450" stroke={mutedStroke} strokeWidth="1.2" />
        <line x1="420" y1="515" x2="535" y2="365" stroke={mutedStroke} strokeWidth="1.2" />
      </g>

      {/* ========================================================================= */}
      {/* 3. DESK ITEMS & DEVELOPER GEAR */}
      {/* ========================================================================= */}
      <g className="desk-items">
        {/* Modern Anglepoise Globe / Architectural Desk Lamp (Left Desk) */}
        <ellipse cx="370" cy="275" rx="14" ry="7" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
        <line x1="370" y1="275" x2="360" y2="210" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
        <circle cx="360" cy="210" r="3" fill={strokeColor} />
        <line x1="360" y1="210" x2="385" y2="175" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" />
        {/* Lamp Dome Shade */}
        <path
          d="M 375 180 C 375 160, 405 145, 415 165 C 418 172, 400 185, 375 180 Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Gentle Ambient Cone of Light */}
        <polygon
          points="390,175 350,290 480,280"
          fill={isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}
          stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />

        {/* Pen/Pencil Pot & Utensils */}
        <ellipse cx="445" cy="285" rx="8" ry="4" fill={fillColor} stroke={strokeColor} strokeWidth="1.2" />
        <path d="M 437 285 L 437 265 C 437 260, 453 260, 453 265 L 453 285 Z" fill={fillColor} stroke={strokeColor} strokeWidth="1.2" />
        {/* Pens sticking out */}
        <line x1="442" y1="265" x2="438" y2="245" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="445" y1="265" x2="445" y2="240" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="448" y1="265" x2="453" y2="247" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />

        {/* Water Bottle / Flask */}
        <ellipse cx="665" cy="180" rx="9" ry="4.5" fill={fillColor} stroke={strokeColor} strokeWidth="1.2" />
        <path d="M 656 180 L 656 145 Q 665 138, 674 145 L 674 180 Z" fill={fillColor} stroke={strokeColor} strokeWidth="1.2" />
        <rect x="662" y="135" width="6" height="6" fill={fillColor} stroke={strokeColor} strokeWidth="1" />

        {/* Framed Architecture Art / Vertical Secondary Display */}
        <polygon points="585,150 635,125 635,185 585,210" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
        <polygon points="590,155 630,132 630,180 590,202" fill="none" stroke={mutedStroke} strokeWidth="0.8" />
        {/* Minimal Mountain Line Art inside Frame */}
        <polyline points="595,190 608,170 618,182 625,172" stroke={strokeColor} strokeWidth="1" />

        {/* Central Work Laptop (Open at ~115° Angle) */}
        {/* Base / Keyboard Half */}
        <polygon
          points="460,320 560,265 615,295 515,350"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        {/* Trackpad */}
        <polygon points="492,333 515,320 527,327 504,340" fill={fillColor} stroke={mutedStroke} strokeWidth="0.8" />
        {/* Keyboard Matrix Grid */}
        <polygon points="475,310 550,268 595,290 520,332" fill="none" stroke={gridStroke} strokeWidth="0.8" />

        {/* Open Display Screen */}
        <polygon
          points="560,265 615,295 615,215 560,185"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        {/* Screen Bezel Inner Border */}
        <polygon points="564,260 611,288 611,220 564,192" fill="none" stroke={highlightStroke} strokeWidth="1" />

        {/* Code Editor Content on Screen (Simulated Syntax Lines) */}
        <line x1="569" y1="205" x2="595" y2="218" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="573" y1="215" x2="605" y2="231" stroke={mutedStroke} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="573" y1="225" x2="590" y2="234" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="573" y1="235" x2="602" y2="250" stroke={mutedStroke} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="569" y1="245" x2="582" y2="252" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
        {/* Live Blinking Code Cursor on Screen */}
        <circle cx="586" cy="254" r="1.5" fill={strokeColor} className="animate-pulse" />

        {/* Spiral Developer Notebook with Pen Resting Beside Keyboard */}
        <polygon points="410,340 455,315 480,330 435,355" fill={fillColor} stroke={strokeColor} strokeWidth="1.2" />
        {/* Spiral Binder Rings */}
        {[0, 4, 8, 12, 16, 20].map((offset, i) => (
          <circle key={i} cx={410 + offset * 1.8} cy={340 - offset * 1} r="1" stroke={strokeColor} strokeWidth="0.8" />
        ))}
        {/* Pen Beside Notebook */}
        <line x1="440" y1="362" x2="475" y2="342" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* ========================================================================= */}
      {/* 4. WIREFRAME BLUEPRINT & SCROLL BASKET (Front-Left) */}
      {/* ========================================================================= */}
      <g className="basket-blueprints">
        {/* Wireframe Wastepaper / Plan Basket Top Rim */}
        <ellipse cx="370" cy="570" rx="28" ry="14" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
        {/* Basket Body */}
        <path
          d="M 342 570 L 350 635 C 350 645, 390 645, 390 635 L 398 570 Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Wire Mesh Diamond Lattice on Basket */}
        <line x1="345" y1="580" x2="385" y2="635" stroke={gridStroke} strokeWidth="0.75" />
        <line x1="355" y1="575" x2="390" y2="625" stroke={gridStroke} strokeWidth="0.75" />
        <line x1="395" y1="580" x2="355" y2="635" stroke={gridStroke} strokeWidth="0.75" />
        <line x1="385" y1="575" x2="350" y2="625" stroke={gridStroke} strokeWidth="0.75" />

        {/* Rolled Architectural Blueprint Tubes / Paper Scrolls Standing Inside */}
        {/* Roll 1 (Leaning Left) */}
        <g>
          <line x1="365" y1="590" x2="340" y2="475" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="375" y1="585" x2="350" y2="470" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="345" cy="472.5" rx="5.5" ry="3" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
        </g>
        {/* Roll 2 (Vertical) */}
        <g>
          <line x1="370" y1="590" x2="370" y2="455" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="380" y1="588" x2="380" y2="453" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="375" cy="454" rx="5" ry="2.5" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
        </g>
        {/* Roll 3 (Leaning Right) */}
        <g>
          <line x1="375" y1="590" x2="405" y2="495" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="385" y1="585" x2="415" y2="490" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="410" cy="492.5" rx="5.5" ry="3" fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
        </g>
      </g>

      {/* ========================================================================= */}
      {/* 5. MODERN ERGONOMIC STUDIO ARMCHAIR (Front-Right) */}
      {/* ========================================================================= */}
      <g className="studio-chair transition-transform duration-300 hover:translate-y-[-2px]">
        {/* Chair Seat Cushion */}
        <polygon
          points="560,430 680,360 740,400 620,470"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Seat Cushion Thickness */}
        <polygon
          points="560,430 620,470 620,485 560,445"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <polygon
          points="620,470 740,400 740,415 620,485"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />

        {/* Backrest Cushion */}
        <polygon
          points="680,360 740,400 740,300 680,260"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Backrest Thickness Side */}
        <polygon
          points="680,360 680,260 668,267 668,367"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Armrest Left (Near Desk) */}
        <polyline
          points="575,415 575,365 675,305 675,340"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Armrest Right (Outer) */}
        <polyline
          points="635,455 635,405 735,345 735,380"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Chair Legs (Slender Tapered Modern Tubes) */}
        {/* Front Left Leg */}
        <line x1="565" y1="445" x2="550" y2="575" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" />
        {/* Front Right Leg */}
        <line x1="620" y1="485" x2="610" y2="615" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" />
        {/* Back Left Leg */}
        <line x1="675" y1="365" x2="665" y2="495" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" />
        {/* Back Right Leg */}
        <line x1="735" y1="415" x2="730" y2="545" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" />
      </g>
    </svg>
  );
};
