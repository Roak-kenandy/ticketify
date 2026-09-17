import {SNACK_BAR} from '../types/type';

const initialState = {
  snackbar: {
    position: 'top',
    message: '',
    type: 'success',
    isOpen: true,
  },
};

const NotificationReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case SNACK_BAR:
      return {
        ...state,
        snackbar: action.payload,
      };
    default:
      return state;
  }
};

export default NotificationReducer;

// export initial state
