import type { ImageMetadata } from 'astro';

export type IlloKey =
  | 'espresso'
  | 'flat'
  | 'cappuccino'
  | 'filter'
  | 'latte'
  | 'citrus'
  | 'tea'
  | 'cocoa'
  | 'buckthorn'
  | 'matcha'
  | 'icedlatte'
  | 'lemonade'
  | 'coldbrew'
  | 'mojito'
  | 'honeycake'
  | 'cheesecake'
  | 'brownie'
  | 'tart'
  | 'croissant'
  | 'syrniki'
  | 'sandwich'
  | 'toast'
  | 'waffle';

export interface MenuItem {
  slug: string;
  name: string;
  price: number;
  description: string;
  illo: IlloKey;
  tag?: 'hit' | 'new' | null;
}

export interface MenuCategory {
  category: string;
  title: string;
  hand: string;
  note: string;
  items: MenuItem[];
  updatedAt: Date;
}

export interface HoursRule {
  days: number[];
  open: string;
  close: string;
}

export interface SiteData {
  name: string;
  tagline: string;
  address: { street: string; city: string; postalCode: string; note: string };
  phone: string;
  /** телефон у людському вигляді: +380 44 123 45 67 */
  phoneDisplay: string;
  email: string;
  /** скільки днів зберігаємо заявки (BR 004) */
  privacy?: { retentionDays: number };
  timezone: string;
  hours: HoursRule[];
  closures: { date: string; reason: string }[];
  booking: {
    minLeadMinutes: number;
    horizonDays: number;
    slotStepMinutes: number;
    maxGuests: number;
    capacityPerSlot: number;
    holdMinutes: number;
  };
  map: { lat: number; lng: number; label: string };
  social: { label: string; href: string }[];
}

export type IlloImages = Record<IlloKey, ImageMetadata>;
