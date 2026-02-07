
import CategoryAlias, { ICategoryAlias } from '../models/CategoryAlias';
import { AppError } from '../utils/AppError';

export class CategoryAliasService {
  async getAllAliases(): Promise<ICategoryAlias[]> {
    return CategoryAlias.find().sort({ alias: 1 });
  }

  async createAlias(data: { alias: string; mainCategories: string[] }): Promise<ICategoryAlias> {
    // Basic validation
    if (!data.alias || !data.mainCategories || data.mainCategories.length === 0) {
      throw new AppError('Alias and at least one main category are required.', 400);
    }

    const newAlias = await CategoryAlias.create(data);
    return newAlias;
  }

  async updateAlias(aliasId: string, data: { alias?: string; mainCategories?: string[] }): Promise<ICategoryAlias | null> {
    const alias = await CategoryAlias.findById(aliasId);
    if (!alias) {
      throw new AppError('Alias not found', 404);
    }

    if (data.alias) {
      alias.alias = data.alias;
    }
    if (data.mainCategories) {
      alias.mainCategories = data.mainCategories;
    }

    await alias.save();
    return alias;
  }

  async deleteAlias(aliasId: string): Promise<void> {
    const alias = await CategoryAlias.findById(aliasId);
    if (!alias) {
      throw new AppError('Alias not found', 404);
    }
    await alias.deleteOne();
  }
}
