import * as StatsModel from './stats.model';
import * as StatsServices from './stats.service';

/**
 * get stat by name
 */
export const getStatByName = async (stat: string): Promise<StatsModel.Stat> => {
  return await StatsServices.getStatByName(stat);
};
