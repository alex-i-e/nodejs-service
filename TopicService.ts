import {SourceEnum} from '../Model/PathToResource';
import {service} from '../Utils/PathToResource';
import {IHeadline} from '../Model/PathToResource';
import {SortOrderEnum} from '../Snapshot/PathToResource';
import {ISnapshotParams} from '../Model/PathToResource';
import {Token} from '../Model/PathToResource';
import {IInfoError, IPrePostEarnings, IResearchSummary} from '../Model/PathToResource';
import {OnPremSnapshotService} from '../Snapshot/PathToResource';
import {SnapshotParamsFactory} from '../Snapshot/PathToResource';
import {ISnapshotResponse} from '../Model/PathToResource';
import * as Promise from 'bluebird';
import * as _ from 'underscore';

const _30_DAYS = 'LAST 30 d';
const BASE_OPTS: {
    [key: string]: string
} = {
    daterange: 'LAST 1 d',
    lang: 'PreferredLanguagesIfNotDefine'
};

const NEWS_OPTS = {
    ResearchSummary: {
        search: 'Topic:RCHSUM',
        error: 'Failed to load Research Summary'
    },
    PrePostEarnings: {
        search: 'Report:EARN/SUM',
        error: 'Failed to load PrePost Earnings'
    }
};

@service()
export class TopicService {
    constructor(private onPremSnapshotService: OnPremSnapshotService,
                private snapshotParamsFactory: SnapshotParamsFactory) {
    }

    public getAnnotateQuery(type: 'ResearchSummary' | 'PrePostEarnings', qa: boolean = false): string {
        const OPTS = qa ? {...BASE_OPTS, ...{daterange: _30_DAYS}} : BASE_OPTS;

        return _.values(OPTS).concat(NEWS_OPTS[type].search).join(' ');
    }

    public getHeadlines(type: 'ResearchSummary' | 'PrePostEarnings', query: Token, repositories: string[] = [SourceEnum.NewsWire], number: number = 10): Promise<IResearchSummary | IPrePostEarnings | IInfoError> {
        const snapshotParams: ISnapshotParams = this.snapshotParamsFactory.get(query);
        snapshotParams.repositories = repositories;
        snapshotParams.number = number;
        snapshotParams.sortOrder = SortOrderEnum.NewToOld;

        return this.onPremSnapshotService.requestSnapshot(query, snapshotParams)
            .then((response: ISnapshotResponse) => {
                return response.headlines;
            })
            .then((headlines: IHeadline[]) => ({headlines}))
            .catch(() => {
                return {error: NEWS_OPTS[type].error};
            });
    }
}
