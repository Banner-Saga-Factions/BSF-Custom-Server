import * as UsersModels from './users.model';
import * as UsersServices from './users.service';

/**
 * Get user record based on id provided
 */
export const getUser = async (user_id: number) => {
    try {
        return await UsersServices.getUserById(user_id);
    } catch (error) {
        return -1;
    }
};

  /**
 * Update user login count - triggers on successful login
 */
export const updateUserLoginCount = async (user_id: number) => {
    await UsersServices.updateUserLoginCount(user_id);
};

/**
 * updates user's renown
 */
export const updateUsersRenown = async (renown: UsersModels.User['renown'], id: UsersModels.User['id']) => {
    await UsersServices.updateUsersRenown(renown, id);
};

/**
 * updates user's roster_rows and renown - triggers when expanding barracks
 */
export const expandUserBarracks = async (id: UsersModels.User['id']) => {
    await UsersServices.expandUserBarracks(id);
};
