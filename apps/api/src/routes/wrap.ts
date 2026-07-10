import type { Request, RequestHandler, Response } from "express";

export function wrap(
  controller: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void controller(req, res).catch(next);
  };
}
