import {LOGIN_SUCCESS, LOGOUT} from '../types/type';
// import AsyncStorage from '@react-native-async-storage/async-storage';

const initialState = {
  isLoggedIn: false,
  isOnline: false,
  user: null,
  token: null,
};

const authReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case LOGIN_SUCCESS:
      return {
        isLoggedIn: true,
        user: action.payload.user,
        token: action.payload.token,
      };
    case LOGOUT:
      console.log('Logging out user');
      return {
        ...initialState,
      };
    case 'USER_STATUS':
      return {
        ...state,
        isOnline: action.payload,
      };
    default:
      return state;
  }
};

export default authReducer;

// export initial state
