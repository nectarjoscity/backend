import * as UserRepo from '../repositories/userRepository.js';

const errorWithStatus = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const getAllUsers = async () => {
  const users = await UserRepo.find({ isActive: true }, { select: '-password', sort: { createdAt: -1 } });
  return users;
};

export const getUserById = async (id) => {
  const user = await UserRepo.findById(id, { select: '-password' });
  return user;
};

export const createUser = async ({ name, email, password, role }) => {
  const existing = await UserRepo.findByEmail(email);
  if (existing) throw errorWithStatus(400, 'User with this email already exists');
  const user = await UserRepo.create({ name, email, password, role });
  return user;
};

export const updateUser = async (id, updates) => {
  const data = { ...updates };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  if (data.email) {
    const exists = await UserRepo.findByEmail(data.email);
    if (exists && String(exists._id) !== String(id)) {
      throw errorWithStatus(400, 'Another user with this email already exists');
    }
  }

  const user = await UserRepo.updateById(id, data, { new: true, runValidators: true });
  return user;
};

export const deleteUser = async (id) => {
  const user = await UserRepo.deactivateById(id);
  return user;
};