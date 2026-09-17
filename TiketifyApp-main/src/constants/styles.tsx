import {StyleSheet} from 'react-native';
import colors from './colors';

export const globalStyles: {
  container: any;
  inputContainer: any;
  inputWrapper: any;
  label: any;
  input: any;
  error: any;
  rowBetween: any;
} = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 0,
    width: '100%',
  },
  inputContainer: {
    width: '100%',
    gap: 4,
  },
  inputWrapper: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingTop: 10,
    width: '100%',
  },

  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.black,
  },

  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    padding: 10,
    height: 40,
    width: '100%',
    color: colors.black,
  },

  error: {
    marginLeft: 0,
    color: 'red',
    textTransform: 'capitalize',
  },
  rowBetween: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
} as const);
