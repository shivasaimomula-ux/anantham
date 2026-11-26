// Open Targets Platform — CC0. Target → disease associations with evidence scores.
import { postJSON } from '../http';
import { cached } from '../cache';

const GQL = 'https://api.platform.opentargets.org/api/v4/graphql';

export type DiseaseLink = { id: string; name: string; score: number };

const QUERY = `query AssocDiseases($id: String!, $size: Int!) {
  target(ensemblId: $id) {
    approvedSymbol
    associatedDiseases(page: { index: 0, size: $size }) {
      count
      rows { disease { id name } score }
    }
  }
}`;

type Resp = {
	data?: {
		target?: {
			associatedDiseases?: { rows?: { disease: { id: string; name: string }; score: number }[] };
		};
	};
};

export function getDiseases(ensemblGene: string, size = 5): Promise<DiseaseLink[]> {
	return cached(`ot:${ensemblGene}:${size}`, 3 * 24 * 3600_000, async () => {
		try {
			const r = await postJSON<Resp>(GQL, { query: QUERY, variables: { id: ensemblGene, size } });
			const rows = r.data?.target?.associatedDiseases?.rows ?? [];
			return rows.map((x) => ({ id: x.disease.id, name: x.disease.name, score: x.score }));
		} catch {
			return [];
		}
	});
}
