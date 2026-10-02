import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {radius} from '../../constants/styles';
import type {Tone} from '../../constants/ticket-meta';

type Props = {
  title: string;
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  color?: string;
  backgroundColor?: string;
};

/** Legacy outline badge kept for existing callers. */
const ABadge = (props: Props) => {
  const color = props.color || '#000';
  const content = (
    <>
      {props.icon}
      <Text style={[styles.outlineText, {color}, props.textStyle]}>
        {props.title}
      </Text>
    </>
  );
  const style = [
    styles.outline,
    {
      borderColor: color,
      backgroundColor: props.backgroundColor || 'transparent',
    },
    props.style,
  ];
  return props.onPress ? (
    <Pressable onPress={props.onPress} style={style}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
};

/** Filled pill used for ticket state, priority and presence. */
export function ToneBadge({
  tone,
  label,
  showIcon,
  size = 'md',
}: {
  tone: Tone;
  label?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <View
      style={[
        styles.pill,
        size === 'sm' && styles.pillSm,
        {backgroundColor: tone.bg},
      ]}>
      {showIcon ? (
        <Icon
          name={tone.icon}
          size={size === 'sm' ? 11 : 13}
          color={tone.color}
        />
      ) : null}
      <Text
        style={[
          styles.pillText,
          size === 'sm' && styles.pillTextSm,
          {color: tone.color},
        ]}
        numberOfLines={1}>
        {label ?? tone.label}
      </Text>
    </View>
  );
}

export default ABadge;

const styles = StyleSheet.create({
  outline: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  outlineText: {fontWeight: '500', fontSize: 10},
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillSm: {paddingHorizontal: 8, paddingVertical: 3},
  pillText: {fontSize: 12, fontWeight: '600'},
  pillTextSm: {fontSize: 11},
});
