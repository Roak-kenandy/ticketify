import {configureStore, Middleware} from '@reduxjs/toolkit';

import authReducer from './reducers/auth.reducer';
import globalReducer from './reducers/global.reducer';
import NotificationReducer from './reducers/notifications.reducer';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    global: globalReducer,
    notifications: NotificationReducer,
  },
});

export default store;
