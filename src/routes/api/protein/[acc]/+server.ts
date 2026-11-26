import { error } from '@sveltejs/kit';
import { getText, getJSON } from '#lib/server/http';
import { cached } from '#lib/server/cache';
import type { RequestHandler } from './$types';

// Resolves an AlphaFold predicted structure (PDB) for a UniProt accession and
// proxies it to the browser for Mol*/3Dmol rendering.
async function alphafoldPdb(acc: string): Promise<string | null> {
	return cached(`af:${acc}`, 7 * 24 * 3600_000, async () => {
		try {
			const meta = await getJSON<{ pdbUrl?: string }[]>(`https://alphafold.ebi.ac.uk/api/prediction/${acc}`);
			const url = meta?.[0]?.pdbUrl;
			if (!url) return null;
			return await getText(url, { retries: 1 });
		} catch {
			return null;
		}
	});
}

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const acc = params.acc.toUpperCase();
	if (!/^[A-Z0-9]{6,10}$/.test(acc)) throw error(400, 'bad accession');
	const pdb = await alphafoldPdb(acc);
	if (!pdb) throw error(404, 'no model');
	setHeaders({ 'content-type': 'chemical/x-pdb', 'cache-control': 'public, max-age=86400' });
	return new Response(pdb);
};
