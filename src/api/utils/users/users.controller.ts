// import { Request, RequestHandler, Response } from 'express';
// import {
//   ITeam,
//   IGetTeamReq,
//   IAddTeamReq,
//   IUpdateTeamReq,
//   IDeleteTeamReq
// } from './users.model';
// import * as UserService from './users.service';

// /**
//  * Get active team records
//  *
//  * @param req Express Request
//  * @param res Express Response
//  */
// export const getTeams: RequestHandler = (req: Request, res: Response) => {
//   const activeTeams = TEAMS.filter((team) => team.isActive);
//   res.send(activeTeams);
// };

// /**
//  * Get team record based on id provided
//  *
//  * @param req Express Request
//  * @param res Express Response
//  */
// // @ts-ignore
// export const getUsersById: RequestHandler = async (req: IGetTeamReq, res: Response) => {
//   try {
//     const team = await UserService.getUsersById(req.params.id);

//     res.status(200).json({
//       team
//     });
//   } catch (error) {
//     console.error('[teams.controller][getTeamById][Error] ', typeof error === 'object' ? JSON.stringify(error) : error);
//     res.status(500).json({
//       message: 'There was an error when fetching team'
//     });
//   }
// };
