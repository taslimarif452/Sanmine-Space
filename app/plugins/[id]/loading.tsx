export default function PluginManageLoading() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-[900px] px-5 pb-12 pt-6 sm:px-8 md:pt-10">
        <div className="h-5 w-28 animate-pulse rounded-md bg-[#e8e6e1]" />

        <header className="mt-8 flex items-center gap-4 border-b border-[#e7e4df] pb-7">
          <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-[#e8e6e1]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-7 w-48 animate-pulse rounded-md bg-[#e8e6e1]" />
            <div className="h-4 w-full max-w-[520px] animate-pulse rounded-md bg-[#eeece8]" />
          </div>
          <div className="hidden h-5 w-5 animate-pulse rounded bg-[#eeece8] sm:block" />
        </header>

        <section className="mt-8">
          <div className="h-5 w-24 animate-pulse rounded-md bg-[#e8e6e1]" />
          <div className="mt-3 rounded-2xl border border-[#e3e0da] bg-white p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-[#eeece8]" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-4 w-32 animate-pulse rounded bg-[#e8e6e1]" />
                <div className="h-4 w-64 max-w-full animate-pulse rounded bg-[#eeece8]" />
                <div className="h-3 w-80 max-w-full animate-pulse rounded bg-[#f0eeea]" />
              </div>
            </div>
            <div className="mt-5 border-t border-[#eeeae4] pt-5">
              <div className="h-11 w-full animate-pulse rounded-xl bg-[#eeece8]" />
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="h-5 w-28 animate-pulse rounded-md bg-[#e8e6e1]" />
          <div className="mt-3 rounded-2xl border border-[#e3e0da] bg-white px-5 sm:px-6">
            <div className="flex items-center gap-4 py-5">
              <div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-44 animate-pulse rounded bg-[#e8e6e1]" /><div className="h-3 w-72 max-w-full animate-pulse rounded bg-[#f0eeea]" /></div>
              <div className="h-4 w-20 animate-pulse rounded bg-[#eeece8]" />
            </div>
            <div className="flex items-center gap-4 border-t border-[#eeeae4] py-5">
              <div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-32 animate-pulse rounded bg-[#e8e6e1]" /><div className="h-3 w-80 max-w-full animate-pulse rounded bg-[#f0eeea]" /></div>
              <div className="h-4 w-4 animate-pulse rounded bg-[#eeece8]" />
            </div>
          </div>
        </section>

        <div className="mt-8 h-36 animate-pulse rounded-2xl border border-[#eaded9] bg-[#fff8f5]" />
      </div>
    </main>
  );
}
