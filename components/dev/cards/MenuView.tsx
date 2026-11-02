'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { MenuMeal } from '@/lib/graph-cards';

/** One day's menu: a tab per meal, filters for vegan, vegetarian and gluten, a box per station. */
export function MenuView({ meals, days, initialMeal }: {
  meals: MenuMeal[];
  days: Array<{ day: string; label: string; href: string; current: boolean }>;
  initialMeal: string | null;
}) {
  const [meal, setMeal] = useState(initialMeal && meals.some(item => item.name === initialMeal) ? initialMeal : meals[0]?.name ?? '');
  const [filter, setFilter] = useState<'vegan' | 'vegetarian' | 'gluten' | null>(null);
  const shown = meals.find(item => item.name === meal);
  const keep = (dish: MenuMeal['stations'][number]['dishes'][number]) =>
    filter === 'vegan' ? dish.vegan
      : filter === 'vegetarian' ? dish.vegetarian || dish.vegan
        : filter === 'gluten' ? !dish.allergens.some(allergen => /gluten|wheat/i.test(allergen))
          : true;
  const tab = (on: boolean) => `rounded-lg border px-3 py-1.5 text-[12.5px] ${on ? 'border-orange-400 bg-[#2a2a2a] text-white' : 'border-[#333] bg-[#1d1d1d] text-zinc-400 hover:text-zinc-200'}`;
  return (
    <div>
      <nav aria-label="Menu day" className="mb-2 flex flex-wrap gap-1.5">
        {days.map(day => (
          <Link key={day.day} href={day.href} prefetch={false} scroll={false} aria-current={day.current ? 'date' : undefined} className={tab(day.current)}>
            {day.label}
          </Link>
        ))}
      </nav>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {meals.map(item => (
          <button key={item.name} type="button" onClick={() => setMeal(item.name)} aria-pressed={item.name === meal} className={tab(item.name === meal)}>
            {item.name} · {item.count}
          </button>
        ))}
        <span className="flex-1" />
        {([['vegan', 'VG vegan'], ['vegetarian', 'V vegetarian'], ['gluten', 'No gluten']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(filter === key ? null : key)} aria-pressed={filter === key} className={tab(filter === key)}>
            {label}
          </button>
        ))}
      </div>
      {!shown ? <p className="text-sm text-zinc-400">No menu for this day.</p> : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.stations.map(station => {
            const dishes = station.dishes.filter(keep);
            if (!dishes.length) return null;
            return (
              <div key={station.name} className="rounded-xl border border-[#2e2e2e] bg-[#1c1c1c] px-3 py-2.5 text-[13px]">
                <p className="mb-1 font-bold text-orange-300">{station.name} <span className="font-normal text-zinc-500">· {dishes.length}</span></p>
                <ul>
                  {dishes.map(dish => (
                    <li key={dish.name} className="py-0.5">
                      <details>
                        <summary className="flex cursor-pointer list-none justify-between gap-2">
                          <span>
                            {dish.name}
                            {dish.vegan ? <span className="ml-1 rounded border border-emerald-900 bg-emerald-950/70 px-1 text-[10px] font-semibold text-emerald-300">VG</span>
                              : dish.vegetarian ? <span className="ml-1 rounded border border-sky-900 bg-sky-950/70 px-1 text-[10px] font-semibold text-sky-300">V</span> : null}
                          </span>
                          {dish.calories !== null && <span className="whitespace-nowrap text-zinc-500">{dish.calories} cal</span>}
                        </summary>
                        <p className="pb-1 pl-2 text-xs text-zinc-400">
                          {dish.portion ? `Portion ${dish.portion}. ` : ''}
                          {dish.allergens.length ? `Allergens: ${dish.allergens.join(', ')}.` : 'No allergens listed.'}
                        </p>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">Click a dish for its portion size and allergens.</p>
    </div>
  );
}
