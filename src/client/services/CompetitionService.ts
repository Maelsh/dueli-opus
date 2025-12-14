
import { ApiClient } from '../core/ApiClient';
import type { Competition } from '../../config/types';

export class CompetitionService {
    static async list(params: {
        status?: string;
        category?: string;
        subcategory?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ success: boolean; data: Competition[] }> {
        const queryParams = new URLSearchParams();
        if (params.status) queryParams.append('status', params.status);
        if (params.category) queryParams.append('category', params.category);
        if (params.subcategory) queryParams.append('subcategory', params.subcategory);
        if (params.limit) queryParams.append('limit', params.limit.toString());
        if (params.offset) queryParams.append('offset', params.offset.toString());

        return ApiClient.get(`/api/competitions?${queryParams.toString()}`);
    }
}
