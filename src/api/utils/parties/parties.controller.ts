import * as PartiesModel from './parties.model';
import * as PartiesServices from './parties.service';

/**
 * get stat by name
 */
export const getStatByName = async (stat: string): Promise<PartiesModel.Stat> => {
  return await PartiesServices.getStatByName(stat);
};
