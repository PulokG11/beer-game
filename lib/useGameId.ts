'use client';
import { useSearchParams } from 'next/navigation';

/** Game id from the `?id=` query string (static export cannot use dynamic route segments). */
export function useGameId(): string {
  return useSearchParams().get('id') ?? '';
}
