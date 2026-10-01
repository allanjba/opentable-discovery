import { AiSearchApp } from "@/components/ai-search-app";
import { resolveOrigin } from "@/lib/ip-origin";
import { resolveDiscovery } from "@/lib/discovery";

/**
 * The same experience as `/`, plus the Agent Studio chat.
 *
 * Separate route on purpose: `/` is the submitted work and stays as graded.
 */
export default async function AiSearch() {
  const origin = await resolveOrigin();

  return (
    <main className="flex-1">
      <AiSearchApp
        initialOrigin={origin}
        discovery={await resolveDiscovery(origin)}
      />
    </main>
  );
}
