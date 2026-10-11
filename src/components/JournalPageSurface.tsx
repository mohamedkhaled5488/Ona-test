import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import type { JournalPageTemplate } from '../types/sections';

interface Props {
  template: JournalPageTemplate;
  width: number;
  height: number;
  lineHeight: number; // matches the text's line height so rules sit under each line
  color: string; // rule/grid color, already translucent
}

export const MARGIN_INSET = 44;

// The actual writing surface: ruled, grid or dotted paper drawn behind the text.
export function JournalPageSurface({ template, width, height, lineHeight, color }: Props) {
  if (template === 'blank' || width <= 0 || height <= 0) return null;
  const lh = lineHeight;
  const ruleY = lh - 5; // rule sits just under the baseline of each text line

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {(template === 'lined' || template === 'margin') && (
          <Pattern id="lined" width={lh} height={lh} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={ruleY} x2={lh} y2={ruleY} stroke={color} strokeWidth={1} />
          </Pattern>
        )}
        {template === 'grid' && (
          <Pattern id="grid" width={lh} height={lh} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={ruleY} x2={lh} y2={ruleY} stroke={color} strokeWidth={1} />
            <Line x1={lh - 0.5} y1={0} x2={lh - 0.5} y2={lh} stroke={color} strokeWidth={1} />
          </Pattern>
        )}
        {template === 'dots' && (
          <Pattern id="dots" width={lh} height={lh} patternUnits="userSpaceOnUse">
            <Circle cx={lh / 2} cy={ruleY} r={1.4} fill={color} />
          </Pattern>
        )}
      </Defs>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={`url(#${template === 'margin' ? 'lined' : template})`}
      />
      {template === 'margin' && (
        <Line x1={MARGIN_INSET - 10} y1={0} x2={MARGIN_INSET - 10} y2={height} stroke="#C1554A" strokeOpacity={0.55} strokeWidth={1.5} />
      )}
    </Svg>
  );
}
