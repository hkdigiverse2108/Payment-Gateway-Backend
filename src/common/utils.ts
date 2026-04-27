import { getFirstMatch } from "../helper";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken"
import crypto from 'crypto';
import { Types } from "mongoose";
import { userModel } from "../database";

const jwtSecretKey = process.env.JWT_TOKEN_SECRET;

const generateOtp = () => Math.floor(100000 + Math.random() * 900000);

export const getUniqueOtp = async () => {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const otp = generateOtp();
    const isAlreadyAssign = await getFirstMatch(userModel, { otp }, {}, {});

    if (!isAlreadyAssign) return otp;
    attempts++;
  }

  throw new Error("Failed To Generate Otp");
};

export const getOtpExpireTime = () => {
  return new Date(Date.now() + 10 * 60 * 1000);
};

export const generateHash = async (password = "") => {
  const salt = await bcryptjs.genSalt(10);
  const hashPassword = await bcryptjs.hash(password, salt);
  return hashPassword;
};

export const compareHash = async (password = "", hash = "") => {
  return await bcryptjs.compare(password, hash);
};

export const generateToken = async (data = {}, expiresIn: any = '24h') => {
  const options = typeof expiresIn === 'string' ? { expiresIn } : expiresIn;
  const token = jwt.sign(data, jwtSecretKey!, options);
  return token;
};

export const isValidObjectId = (id: any) => {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
};


export const parseDateRange = (start?: any, end?: any) => {
  if (!start || !end) return null;

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

  return { startDate, endDate };
};

export const resolvePagination = (page?: any, limit?: any) => {
  const parsedLimit = Number(limit);
  const hasLimit = Number.isFinite(parsedLimit) && parsedLimit > 0;
  const limitValue = hasLimit ? Math.floor(parsedLimit) : 0;

  const parsedPage = Number(page);
  const pageValue = hasLimit ? Math.max(Math.floor(parsedPage || 1), 1) : 1;
  const skip = hasLimit ? (pageValue - 1) * limitValue : 0;

  return { page: pageValue, limit: limitValue, skip, hasLimit };
};

export const getPaginationState = (totalCount: number, pageValue: number, limitValue: number) => {
  const pageLimit = limitValue > 0 ? Math.ceil(totalCount / limitValue) || 1 : 1;

  return {
    page: pageValue,
    limit: limitValue > 0 ? limitValue : totalCount,
    page_limit: pageLimit,
  };
};

export const resolveSortAndFilter = (value: any, searchFields: string[] = ['name']) => {
  let { activeFilter, page, limit, startDateFilter, endDateFilter, search, sortFilter } = value;
  let criteria: any = { isDeleted: false }, options: any = { lean: true };

  if (search) {
    if (searchFields.length === 1) {
      criteria[searchFields[0]] = { $regex: search, $options: 'si' };
    } else {
      criteria.$or = searchFields.map(field => ({ [field]: { $regex: search, $options: 'si' } }));
    }
  }

  if (activeFilter === true) criteria.isActive = true;
  else if (activeFilter === false) criteria.isActive = false;

  if (startDateFilter && endDateFilter) {
    criteria.createdAt = { $gte: new Date(startDateFilter), $lte: new Date(endDateFilter) };
  }

  if (sortFilter === "nameAsc") options.sort = { [searchFields[0] || 'name']: 1 };
  else if (sortFilter === "nameDesc") options.sort = { [searchFields[0] || 'name']: -1 };
  else if (sortFilter === "newest") options.sort = { createdAt: -1 };
  else if (sortFilter === "oldest") options.sort = { createdAt: 1 };
  else options.sort = { createdAt: -1 }; // Default sort

  const { skip, limit: limitValue, hasLimit } = resolvePagination(page, limit);
  if (hasLimit) {
    options.skip = skip;
    options.limit = limitValue;
  }

  return { criteria, options, page: page || 1, limit: limitValue };
};

export const verifyToken = (authorization?: string) => {
  if (!authorization) return null;
  const token = authorization.startsWith("Bearer ") ? authorization.split(" ")[1] : authorization;
  return jwt.verify(token, jwtSecretKey) as any;
};

export const createUserService = async () => {
  let apiKey = crypto.randomBytes(16).toString('hex');
  let secretKey = crypto.randomBytes(32).toString('hex');
  return { apiKey, secretKey };
};