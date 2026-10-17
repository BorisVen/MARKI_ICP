/** Where a notification leads: set by the server (`action`/`target`), or guessed from its type. */
export type NotificationLink = { action?: string; target?: string; type?: string };

/**
 * Opens what a notification is about — from a phone push, the banner at the
 * top, or «Вхідні». App.tsx does the navigation.
 */
export function openNotification(link: NotificationLink) {
  window.dispatchEvent(new CustomEvent<NotificationLink>('marki:open-notification', { detail: link }));
}
