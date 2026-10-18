// Service worker a mano (guía PWA de Next). Solo push: sin cache offline.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/" },
      }),
      // Si la PWA está abierta, que se refresque sola (components/live-refresh.tsx escucha esto).
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((wins) => wins.forEach((w) => w.postMessage({ type: "health-updated" }))),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => "focus" in w);
      if (open) {
        open.navigate(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
