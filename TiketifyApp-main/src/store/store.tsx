import {configureStore} from '@reduxjs/toolkit';

import authReducer from './reducers/auth.reducer';
import globalReducer from './reducers/global.reducer';
import NotificationReducer from './reducers/notifications.reducer';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    global: globalReducer,
    notifications: NotificationReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      // Ticket payloads are large CRM documents; the dev-only checks walk the
      // whole tree on every dispatch and make the JS thread stutter.
      serializableCheck: false,
      immutableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;

export default store;
