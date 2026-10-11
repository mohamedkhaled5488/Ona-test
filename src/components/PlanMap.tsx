import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii } from '../theme';
import { withAlpha } from '../utils/color';
import type { Plan, PlanStep } from '../types/sections';
import { themedStyles } from '../theme/runtime';

const NODE_W = 170;
const NODE_H = 46;
const H_GAP = 60;
const V_GAP = 14;
const PAD = 16;
const ALT_COLOR = '#8B72B0';

interface MapNode {
  id: string;
  label: string;
  kind: 'root' | 'step' | 'alt';
  done?: boolean;
  path?: string[]; // step path this node opens (alternatives open their parent step)
  depth: number;
  x: number;
  y: number;
  children: MapNode[];
}

function buildStepNode(step: PlanStep, path: string[], depth: number): MapNode {
  const children: MapNode[] = [
    ...step.subSteps.map((s) => buildStepNode(s, [...path, s.id], depth + 1)),
    ...step.alternatives.map<MapNode>((a) => ({
      id: a.id,
      label: a.label,
      kind: 'alt',
      path,
      depth: depth + 1,
      x: 0,
      y: 0,
      children: [],
    })),
  ];
  return { id: step.id, label: step.title, kind: 'step', done: step.done, path, depth, x: 0, y: 0, children };
}

// Tidy left-to-right tree: leaves take consecutive rows, parents center on their children.
function layout(root: MapNode): { nodes: MapNode[]; width: number; height: number } {
  let nextY = PAD;
  let maxDepth = 0;
  const nodes: MapNode[] = [];

  const place = (node: MapNode) => {
    maxDepth = Math.max(maxDepth, node.depth);
    node.x = PAD + node.depth * (NODE_W + H_GAP);
    if (node.children.length === 0) {
      node.y = nextY;
      nextY += NODE_H + V_GAP;
    } else {
      node.children.forEach(place);
      node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
    }
    nodes.push(node);
  };
  place(root);

  return { nodes, width: PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * H_GAP, height: nextY + PAD - V_GAP };
}

export function PlanMap({ plan, onPressStep }: { plan: Plan; onPressStep: (path: string[]) => void }) {
  const root: MapNode = {
    id: plan.id,
    label: plan.title,
    kind: 'root',
    depth: 0,
    x: 0,
    y: 0,
    children: plan.steps.map((s) => buildStepNode(s, [s.id], 1)),
  };
  const { nodes, width, height } = layout(root);

  const edges: { from: MapNode; to: MapNode }[] = [];
  nodes.forEach((n) => n.children.forEach((c) => edges.push({ from: n, to: c })));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scroll} nestedScrollEnabled>
      <View style={{ width, height }}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          {edges.map(({ from, to }) => {
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const isAlt = to.kind === 'alt';
            return (
              <Path
                key={`${from.id}-${to.id}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                stroke={isAlt ? ALT_COLOR : plan.color}
                strokeWidth={2}
                strokeDasharray={isAlt ? '5 5' : undefined}
                fill="none"
                opacity={0.8}
              />
            );
          })}
        </Svg>

        {nodes.map((n) => {
          const isRoot = n.kind === 'root';
          const isAlt = n.kind === 'alt';
          return (
            <Pressable
              key={`${n.kind}-${n.id}`}
              disabled={isRoot}
              onPress={() => n.path && onPressStep(n.path)}
              style={[
                styles.node,
                { left: n.x, top: n.y },
                isRoot && { backgroundColor: plan.color, borderColor: plan.color },
                isAlt && { borderColor: ALT_COLOR, borderStyle: 'dashed', backgroundColor: withAlpha(ALT_COLOR, 0.12) },
                n.kind === 'step' && { borderColor: plan.color },
              ]}
            >
              {n.kind === 'step' && (
                <Ionicons
                  name={n.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={n.done ? plan.color : colors.inkSoft}
                />
              )}
              {isAlt && <Ionicons name="git-branch-outline" size={14} color={ALT_COLOR} />}
              <Text
                numberOfLines={2}
                style={[styles.nodeText, isRoot && styles.nodeTextRoot, n.done && styles.nodeTextDone]}
              >
                {n.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  scroll: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    borderWidth: 1.5,
    backgroundColor: colors.stone,
  },
  nodeText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    color: colors.ink,
  },
  nodeTextRoot: {
    fontFamily: fonts.headingSemiBold,
    color: colors.white,
  },
  nodeTextDone: {
    color: colors.inkSoft,
    textDecorationLine: 'line-through',
  },
}));
