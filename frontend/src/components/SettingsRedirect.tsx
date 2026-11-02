"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SettingsRedirect({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(href + window.location.hash); }, [href, router]);
  return <p role="status">Opening <Link className="underline" href={href}>Profile &amp; Settings</Link>…</p>;
}
