"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export function AdminProfileMenuLink() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let ownSlot: HTMLElement | null = null;
    const sync = () => {
      const menu = document.querySelector<HTMLElement>(".profile-menu");
      if (!menu) { setSlot(null); return; }
      const present = menu.querySelector<HTMLElement>(".admin-profile-menu-slot");
      if (present) { ownSlot = present; setSlot(present); return; }
      const nextSlot = document.createElement("div");
      nextSlot.className = "admin-profile-menu-slot";
      const integrationStand = [...menu.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.getAttribute("href") === "/");
      menu.insertBefore(nextSlot, integrationStand ?? null);
      ownSlot = nextSlot;
      setSlot(nextSlot);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => { observer.disconnect(); ownSlot?.remove(); };
  }, []);
  return slot ? createPortal(<Link className="profile-menu-link" href="/admin">Админ-панель</Link>, slot) : null;
}
