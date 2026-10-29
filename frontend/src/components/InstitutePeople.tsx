"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/config";
import { useTenantConfig } from "@/context/TenantConfigContext";

interface Person {
  id?: number; user_id?: number | null; name: string; email?: string; role?: string;
  expertise?: string; leads_converted?: number; leads_assigned?: number; revenue_collected?: number;
  students?: number; batches_completed?: number; avg_rating?: number;
}

export default function InstitutePeople({ leaderboard = false }: { leaderboard?: boolean }) {
  const { settings } = useTenantConfig();
  const [sales, setSales] = useState<Person[]>([]);
  const [instructors, setInstructors] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    async function read(path: string) {
      const response = await fetch(`${API_BASE_URL}${path}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not load institute team');
      return data;
    }
    async function load() {
      setLoading(true); setError("");
      try {
        if (leaderboard) {
          // The server authorizes Admin/Demo/SalesManager and selected SuperAdmin.
          const data = await read('/institute/team-performance');
          if (alive) {
            setSales([...data.sales].sort((a: Person, b: Person) => (b.revenue_collected || 0) - (a.revenue_collected || 0)));
            setInstructors([...data.instructors].sort((a: Person, b: Person) => (b.avg_rating || 0) - (a.avg_rating || 0)
              || (b.batches_completed || 0) - (a.batches_completed || 0)));
          }
        } else {
          const [users, teachers] = await Promise.all([read('/users?role=Employee,SalesManager,Sales'), read('/instructors')]);
          if (alive) { setSales(users.users || []); setInstructors(teachers.instructors || []); }
        }
      } catch (err) { if (alive) setError(err instanceof Error ? err.message : 'Could not load institute team'); }
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, [leaderboard, retry]);

  if (loading) return <p role="status" className="p-6">Loading institute team…</p>;
  if (error) return <div role="alert" className="p-6">{error} <button className="ml-3 underline" onClick={() => setRetry(v => v + 1)}>Retry</button></div>;

  const money = (value = 0) => new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.default_currency || 'INR' }).format(value);
  return <div className="space-y-8 p-3 sm:p-6">
    <h1 className="text-2xl font-bold">{leaderboard ? "Institute leaderboards" : "Institute team directory"}</h1>
    {[{ title: leaderboard ? 'Sales leaderboard' : 'Salespeople', people: sales, teachers: false },
      { title: leaderboard ? 'Instructor leaderboard' : 'Instructors', people: instructors, teachers: true }].map(group =>
      <section key={group.title} className="space-y-3">
        <h2 className="text-xl font-semibold">{group.title}</h2>
        {leaderboard && <p className="text-sm text-slate-500">{group.teachers ? 'Ranked by student rating, then completed batches' : 'Ranked by collected enrollment revenue'}</p>}
        {!group.people.length && <p className="text-sm text-slate-500">No {group.teachers ? 'instructors' : 'salespeople'} to show yet.</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {group.people.map((person, index) => <article key={`${person.user_id || person.id}-${index}`} className="min-w-0 rounded-xl border p-4">
            <h3 className="font-semibold break-words">{leaderboard && `${index + 1}. `}{person.name}</h3>
            {!leaderboard && person.email && <a className="block break-all text-sm text-indigo-600" href={`mailto:${person.email}`}>{person.email}</a>}
            {!leaderboard && <p className="text-sm text-slate-500">{group.teachers ? person.expertise || 'Instructor' : person.role}</p>}
            {leaderboard && <dl className="mt-3 space-y-1 text-sm">
              {group.teachers ? <>
                <div>Average student rating: {person.avg_rating || 0}/5</div>
                <div>Completed batches: {person.batches_completed || 0}</div>
                <div>Active students: {person.students || 0}</div>
              </> : <>
                <div>Revenue collected: {money(person.revenue_collected)}</div>
                <div>Leads assigned: {person.leads_assigned || 0}</div>
                <div>Leads enrolled: {person.leads_converted || 0}</div>
              </>}
            </dl>}
          </article>)}
        </div>
      </section>)}
  </div>;
}
