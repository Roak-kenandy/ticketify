import {createNavigationContainerRef} from '@react-navigation/native';
import {
  NotificationClickEvent,
  NotificationWillDisplayEvent,
  OneSignal,
} from 'react-native-onesignal';
import store from '../store/store';
import {syncAllTickets} from './ticketsSync';

export const navigationRef = createNavigationContainerRef<any>();

/** Push types sent by the API (ticketify-core-api push-notifier.service.ts). */
type PushData = {type?: string; ticket_id?: string};

const OPENS_TICKET = new Set([
  'TICKET_ASSIGNED',
  'PAYMENT_RECEIVED',
  'NEW_REVIEW',
]);
const SAFE_TICKET_ID = /^[A-Za-z0-9-]{1,64}$/;

let pendingTicketId: string | null = null;

function readData(raw: unknown): PushData {
  return raw && typeof raw === 'object' ? (raw as PushData) : {};
}

function refreshTickets() {
  const token = store.getState().auth?.token;
  if (token) {
    syncAllTickets(store.dispatch, token, {force: true}).catch(() => {});
  }
}

/** Opens the ticket from a tapped notification once the user is signed in. */
export function openPendingTicket() {
  if (
    !pendingTicketId ||
    !navigationRef.isReady() ||
    !store.getState().auth?.isLoggedIn
  ) {
    return;
  }
  const id = pendingTicketId;
  pendingTicketId = null;
  navigationRef.navigate('ActivityDetailsScreen', {ticket: {id}});
}

function onNotificationClick(event: NotificationClickEvent) {
  const data = readData(event.notification.additionalData);
  refreshTickets();
  if (
    data.type &&
    OPENS_TICKET.has(data.type) &&
    data.ticket_id &&
    SAFE_TICKET_ID.test(data.ticket_id)
  ) {
    pendingTicketId = data.ticket_id;
    openPendingTicket();
  }
}

function onForegroundNotification(_event: NotificationWillDisplayEvent) {
  // The banner still shows (default behaviour); make the job list current too.
  refreshTickets();
}

export function registerPushHandlers(): () => void {
  OneSignal.Notifications.addEventListener('click', onNotificationClick);
  OneSignal.Notifications.addEventListener(
    'foregroundWillDisplay',
    onForegroundNotification,
  );
  return () => {
    OneSignal.Notifications.removeEventListener('click', onNotificationClick);
    OneSignal.Notifications.removeEventListener(
      'foregroundWillDisplay',
      onForegroundNotification,
    );
  };
}
