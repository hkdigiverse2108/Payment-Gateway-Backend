export const createOne = async (model: any, data: any) => {
    return new model(data).save();
};

export const createData = async (model: any, data: any) => {
    return new model(data).save();
};

export const getFirstMatch = async (model: any, criteria: any, projection: any = {}, options: any = {}) => {
    options.lean = true;
    return model.findOne(criteria, projection, options);
};

export const updateData = async (model: any, criteria: any, dataToSet: any, options: any = {}) => {
    options.new = true;
    options.lean = true;
    return model.findOneAndUpdate(criteria, dataToSet, options);
};

export const getDataWithSorting = async (model: any, criteria: any, projection: any = {}, options: any = {}) => {
    options.lean = true;
    let query = model.find(criteria, projection, options);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    if (options.populate) query = query.populate(options.populate);
    return query.exec();
};

export const countData = async (model: any, criteria: any) => {
    return model.countDocuments(criteria);
};

export const getData = async (model: any, criteria: any, projection: any = {}, options: any = {}) => {
    options.lean = true;
    return model.find(criteria, projection, options);
};
