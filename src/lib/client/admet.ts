// Developability / ADMET from physicochemical descriptors.
// Every model here is published and cited — nothing is invented:
//   • ESOL aqueous solubility — Delaney, J. Chem. Inf. Comput. Sci. 2004
//   • Lipinski Ro5 (2001), Veber (2002), Ghose (1999), Egan (2000), Muegge (2001)
//   • Abbott Bioavailability Score — Martin, J. Med. Chem. 2005 (simplified)
//   • BCS class — estimated from solubility × passive permeability (physchem proxy)
// These are model estimates to prioritise, not measured values.

import type { Descriptors } from './chem';

export type Rule = { name: string; pass: boolean; detail: string };
export type Developability = {
	logS: number;
	solMgMl: number;
	solLabel: string;
	gi: 'High' | 'Low';
	bbb: 'Likely' | 'Unlikely';
	bcs: { class: 'I' | 'II' | 'III' | 'IV'; soluble: boolean; permeable: boolean; note: string };
	bioavailabilityScore: number;
	leadLike: boolean;
	rules: Rule[];
	passCount: number;
};

// ESOL (Delaney 2004): logS = 0.16 − 0.63·cLogP − 0.0062·MW + 0.066·RotB − 0.74·AP
function esolLogS(d: Descriptors): number {
	return 0.16 - 0.63 * d.alogp - 0.0062 * d.mw + 0.066 * d.rotb - 0.74 * d.aromaticProportion;
}

function solLabel(logS: number): string {
	if (logS > -2) return 'highly soluble';
	if (logS > -4) return 'soluble';
	if (logS > -6) return 'poorly soluble';
	return 'insoluble';
}

export function developability(d: Descriptors): Developability {
	const logS = esolLogS(d);
	const solMgMl = Math.pow(10, logS) * d.mw * 1000 > 0 ? Math.pow(10, logS) * d.mw : 0; // mol/L→g/L≈mg/mL
	const lipinskiViol =
		(d.mw > 500 ? 1 : 0) + (d.alogp > 5 ? 1 : 0) + (d.hbd > 5 ? 1 : 0) + (d.hba > 10 ? 1 : 0);

	const egan = d.psa <= 131.6 && d.alogp >= -1 && d.alogp <= 5.88;
	const gi: 'High' | 'Low' = egan ? 'High' : 'Low';
	const bbb: 'Likely' | 'Unlikely' = d.psa <= 79 && d.alogp >= 0.4 && d.alogp <= 6 ? 'Likely' : 'Unlikely';

	const soluble = logS >= -4;
	const permeable = egan;
	const cls = soluble && permeable ? 'I' : !soluble && permeable ? 'II' : soluble && !permeable ? 'III' : 'IV';
	const bcsNote =
		cls === 'I'
			? 'well-behaved: dissolves and permeates'
			: cls === 'II'
				? 'solubility-limited — a solubilising formulation helps most'
				: cls === 'III'
					? 'permeability-limited — a permeation enhancer helps most'
					: 'solubility- and permeability-limited — the hardest case';

	const veberPass = d.rotb <= 10 && d.psa <= 140;
	const bioavailabilityScore = veberPass && lipinskiViol <= 1 ? 0.55 : 0.11;
	const leadLike = d.mw <= 350 && d.alogp <= 3.5 && d.rotb <= 7;

	const rules: Rule[] = [
		{
			name: 'Lipinski',
			pass: lipinskiViol <= 1,
			detail: `${lipinskiViol} violation${lipinskiViol === 1 ? '' : 's'} of Ro5`
		},
		{ name: 'Veber', pass: veberPass, detail: `RotB ${d.rotb} ≤10 · TPSA ${d.psa.toFixed(0)} ≤140` },
		{
			name: 'Egan',
			pass: egan,
			detail: `TPSA ${d.psa.toFixed(0)} ≤131.6 · cLogP ${d.alogp.toFixed(1)} ∈[−1,5.9]`
		},
		{
			name: 'Ghose',
			pass: d.mw >= 160 && d.mw <= 480 && d.alogp >= -0.4 && d.alogp <= 5.6 && d.mr >= 40 && d.mr <= 130 && d.atoms >= 20 && d.atoms <= 70,
			detail: `MW·cLogP·MR·atoms in range`
		},
		{
			name: 'Muegge',
			pass:
				d.mw >= 200 && d.mw <= 600 && d.alogp >= -2 && d.alogp <= 5 && d.psa <= 150 && d.rings <= 7 && d.rotb <= 15 && d.hbd <= 5 && d.hba <= 10,
			detail: `drug-likeness filter`
		}
	];
	const passCount = rules.filter((r) => r.pass).length;

	return {
		logS: Math.round(logS * 100) / 100,
		solMgMl,
		solLabel: solLabel(logS),
		gi,
		bbb,
		bcs: { class: cls, soluble, permeable, note: bcsNote },
		bioavailabilityScore,
		leadLike,
		rules,
		passCount
	};
}

export function solMgMlLabel(v: number): string {
	if (v >= 1) return v.toFixed(1) + ' mg/mL';
	if (v >= 0.01) return v.toFixed(3) + ' mg/mL';
	return v.toExponential(1) + ' mg/mL';
}
