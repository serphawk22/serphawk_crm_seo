import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Product Overview | SerpHawk CRM Documentation",
  description: "Learn how SerpHawk CRM works. Review the sales and admissions workflows, available modules, and how workspace access is configured.",
};

const sections = [
  { id: "overview", label: "Product overview" },
  { id: "sales", label: "Sales workflow" },
  { id: "admissions", label: "Admissions workflow" },
  { id: "capabilities", label: "CRM capabilities" },
  { id: "workspace", label: "Workspace and access" },
];

const capabilities = [
  { name: "Leads, Contacts, and Clients", use: "Manage enquiries, the people involved, and the accounts they belong to. Open a record to review its recent activity and next actions." },
  { name: "Email Agent and Sales Next Steps", use: "Research a company by its website, save findings to the client record, and prepare an outreach draft or a plan for review." },
  { name: "Meetings, Follow-ups, and Tasks", use: "Record conversations and agreed actions, then assign follow-up work and track it to completion." },
  { name: "Proposals and Invoices", use: "Prepare and share proposals or track client invoices in workspaces with these modules enabled." },
  { name: "Reports", use: "Review trends in leads, conversions, and team activity using the reports available in your workspace." },
];

const sectionStyle = "scroll-mt-24 border-t border-slate-200 py-8";
const headingStyle = "mb-3 text-2xl font-semibold tracking-tight";
const listStyle = "list-decimal space-y-3 pl-5 text-base leading-7 text-slate-700 marker:font-semibold";

export default function ProductOverviewPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <a href="#overview" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded-md focus:bg-white focus:p-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/product-guide" className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
            <Image
              src="/Serp%20Hawk%20Logo.png"
              alt=""
              width={34}
              height={34}
              unoptimized
              loading="eager"
              className="shrink-0 rounded-md object-contain"
            />
            <span>SerpHawk CRM</span>
          </Link>
          <div className="flex shrink-0 items-center gap-4 text-sm font-medium sm:gap-6">
            <Link href="/showcase" className="hidden text-slate-600 hover:text-slate-950 sm:inline">Product showcase</Link>
            <Link href="/login" className="rounded-lg border border-slate-200 px-3.5 py-2 hover:bg-slate-50">Sign in</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <aside className="border-b border-slate-200 py-5 lg:border-r lg:border-b-0 lg:py-10 lg:pr-6">
          <nav aria-label="Documentation sections" className="lg:sticky lg:top-24">
            <p className="mb-2 text-sm font-semibold">On this page</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 lg:block">
              {sections.map(({ id, label }) => (
                <li key={id}>
                  <a href={`#${id}`} className="block rounded-md py-1.5 hover:text-violet-800 hover:underline lg:px-2 lg:py-2 lg:hover:bg-violet-50">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main id="overview" tabIndex={-1} className="max-w-3xl scroll-mt-24 pt-8 pb-12 lg:pt-10">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Product overview</h1>
          <p className="mt-4 mb-8 text-lg leading-8 text-slate-700">
            SerpHawk CRM helps organisations manage enquiries, client relationships, and follow-up work in one workspace. Each record gives the people with access a shared history of conversations and decisions, along with the owner and the next action.
          </p>

          <section id="sales" aria-labelledby="sales-title" className={sectionStyle}>
            <h2 id="sales-title" className={headingStyle}>Sales workflow</h2>
            <ol className={listStyle}>
              <li><strong>Capture and assign enquiries.</strong> Add a lead or collect an enquiry through a web form. Assign an owner and update the lead stage as the conversation progresses.</li>
              <li><strong>Research and follow up.</strong> Enter a company website in Email Agent and review the findings before saving them to the client record. Review the outreach draft and insert your booking link if you want the recipient to schedule a meeting.</li>
              <li><strong>Manage the relationship.</strong> Record what you discussed, what was agreed, and who owns each next action. Use the record history when preparing a proposal, following up, or handing the account over.</li>
            </ol>
          </section>

          <section id="admissions" aria-labelledby="admissions-title" className={sectionStyle}>
            <h2 id="admissions-title" className={headingStyle}>Admissions workflow</h2>
            <ol className={listStyle}>
              <li><strong>Record student enquiries.</strong> Capture the applicant’s details, course interest, and assigned admissions owner.</li>
              <li><strong>Track follow-ups.</strong> Update the enquiry as the applicant moves through counselling, meetings, or other admissions activities.</li>
              <li><strong>Manage enrolment.</strong> Enrol the student in a course and batch, then use the institute modules to track fees and attendance.</li>
            </ol>
          </section>

          <section id="capabilities" aria-labelledby="capabilities-title" className={sectionStyle}>
            <h2 id="capabilities-title" className={headingStyle}>CRM capabilities</h2>
            <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200">
              {capabilities.map(({ name, use }) => (
                <div key={name} className="grid gap-1 px-4 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4 sm:px-5">
                  <dt className="font-semibold">{name}</dt>
                  <dd className="text-sm leading-6 text-slate-700">{use}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="workspace" aria-labelledby="workspace-title" className={sectionStyle}>
            <h2 id="workspace-title" className={headingStyle}>Workspace and access</h2>
            <p className="leading-7 text-slate-700">
              Choose a workspace model that matches your process, such as business sales or institute admissions. The modules you see depend on your workspace configuration, and your role determines which records and actions you can access.
            </p>
            <Link href="/demo" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50">
              Explore the demo <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </section>
        </main>
      </div>
    </div>
  );
}
