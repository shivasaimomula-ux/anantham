// ML-ready prediction boundary.
//
// Physicochemical / ADMET predictions go through here instead of being hard-coded.
// When ADMET_SERVICE_URL is configured (a Python model microservice — see
// ml-service/), predictions come from a trained model WITH calibrated uncertainty.
// Otherwise this returns the legacy heuristic, explicitly labeled method:'heuristic'
// so the UI never presents an estimate as if it were a measured or learned value.
import { postJSON } from './http';

export type Prediction = {
	property: string;
	value: number;
	uncertainty: number | null; // ± (model std / conformal interval); null for heuristic
	method: 'model' | 'heuristic';
	modelVersion: string | null;
	inDomain: boolean; // false => out of the model/heuristic's valid applicability domain
};

const SERVICE = () => process.env.ADMET_SERVICE_URL;

type ServiceResp = { value: number; uncertainty?: number; model_version?: string; in_domain?: boolean };

/** Aqueous solubility (logS, mol/L). Model when available; reduced ESOL otherwise. */
export async function predictSolubility(smiles: string | null, xlogp: number | null, mw: number | null): Promise<Prediction | null> {
	const svc = SERVICE();
	if (svc && smiles) {
		try {
			const r = await postJSON<ServiceResp>(`${svc.replace(/\/$/, '')}/predict/solubility`, { smiles }, { timeoutMs: 8000, retries: 1 });
			if (r && Number.isFinite(r.value)) {
				return { property: 'logS', value: round(r.value), uncertainty: r.uncertainty ?? null, method: 'model', modelVersion: r.model_version ?? 'unknown', inDomain: r.in_domain ?? true };
			}
		} catch {
			/* fall through to heuristic */
		}
	}
	if (xlogp == null || mw == null) return null;
	// Reduced ESOL (Delaney) — a transparent heuristic, NOT a trained model.
	const logS = 0.16 - 0.63 * xlogp - 0.0062 * mw;
	return {
		property: 'logS',
		value: round(logS),
		uncertainty: null,
		method: 'heuristic',
		modelVersion: null,
		// Applicability domain of the reduced equation: typical small-molecule logP range.
		inDomain: xlogp >= -2 && xlogp <= 7 && mw <= 900
	};
}

export function predictionProvenance(): { admetService: boolean } {
	return { admetService: !!SERVICE() };
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}
