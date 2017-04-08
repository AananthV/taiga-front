/*
 * Copyright (C) 2014-2017 Andrey Antukh <niwi@niwi.nz>
 * Copyright (C) 2014-2017 Jesús Espino Garcia <jespinog@gmail.com>
 * Copyright (C) 2014-2017 David Barragán Merino <bameda@dbarragan.com>
 * Copyright (C) 2014-2017 Alejandro Alonso <alejandro.alonso@kaleidos.net>
 * Copyright (C) 2014-2017 Juan Francisco Alcántara <juanfran.alcantara@kaleidos.net>
 * Copyright (C) 2014-2017 Xavi Julian <xavier.julian@kaleidos.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 * File: modules/base/repository.coffee
 */

import {Service} from "../../../ts/classes"
import * as _ from "lodash"
import * as angular from "angular"

class RepositoryService extends Service {
    q:any
    model:any
    storage:any
    http:any
    urls:any

    static initClass() {
        this.$inject = ["$q", "$tgModel", "$tgStorage", "$tgHttp", "$tgUrls"];
    }

    constructor(q, model, storage, http, urls) {
        super();
        this.q = q;
        this.model = model;
        this.storage = storage;
        this.http = http;
        this.urls = urls;
    }

    resolveUrlForModel(model) {
        let idAttrName = model.getIdAttrName();
        return `${this.urls.resolve(model.getName())}/${model[idAttrName]}`;
    }

    resolveUrlForAttributeModel(model) {
        return this.urls.resolve(model.getName(), model.parent);
    }

    create(name, data, dataTypes, extraParams) {
        if (dataTypes == null) { dataTypes = {}; }
        if (extraParams == null) { extraParams = {}; }
        let defered = this.q.defer();
        let url = this.urls.resolve(name);

        let promise = this.http.post(url, JSON.stringify(data), extraParams);
        promise.success((_data, _status) => {
            return defered.resolve(this.model.make_model(name, _data, null, dataTypes));
        });

        promise.error((data, status) => {
            return defered.reject(data);
        });

        return defered.promise;
    }

    remove(model, params) {
        if (params == null) { params = {}; }
        let defered = this.q.defer();
        let url = this.resolveUrlForModel(model);

        let promise = this.http.delete(url, {}, params);
        promise.success((data, status) => defered.resolve(model));

        promise.error((data, status) => defered.reject(model));

        return defered.promise;
    }

    saveAll(models, patch) {
        if (patch == null) { patch = true; }
        let promises = _.map(models, x => this.save(x, true));
        return this.q.all(promises);
    }

    save(model, patch=true, params={}, options={}, returnHeaders=false) {
        let promise;
        let defered = this.q.defer();

        if (!model.isModified() && patch) {
            defered.resolve(model);
            return defered.promise;
        }

        let url = this.resolveUrlForModel(model);

        let data = JSON.stringify(model.getAttrs(patch));

        if (patch) {
            promise = this.http.patch(url, data, params, options);
        } else {
            promise = this.http.put(url, data, params, options);
        }

        promise.success((data, status, headers, response) => {
            model._isModified = false;
            model._attrs = _.extend(model.getAttrs(), data);
            model._modifiedAttrs = {};

            model.applyCasts();

            if (returnHeaders) {
                return defered.resolve([model, headers()]);
            } else {
                return defered.resolve(model);
            }
        });

        promise.error((data, status) => defered.reject(data));

        return defered.promise;
    }

    saveAttribute(model, attribute, patch) {
        let promise;
        if (patch == null) { patch = true; }
        let defered = this.q.defer();

        if (!model.isModified() && patch) {
            defered.resolve(model);
            return defered.promise;
        }

        let url = this.resolveUrlForAttributeModel(model);

        let data = {};

        data[attribute] = model.getAttrs();

        if (patch) {
            promise = this.http.patch(url, data);
        } else {
            promise = this.http.put(url, data);
        }

        promise.success((data, status) => {
            model._isModified = false;
            model._attrs = _.extend(model.getAttrs(), data);
            model._modifiedAttrs = {};

            model.applyCasts();
            return defered.resolve(model);
        });

        promise.error((data, status) => defered.reject(data));

        return defered.promise;
    }

    refresh(model) {
        let defered = this.q.defer();

        let url = this.resolveUrlForModel(model);
        let promise = this.http.get(url);
        promise.success(function(data, status) {
            model._modifiedAttrs = {};
            model._attrs = data;
            model._isModified = false;
            model.applyCasts();
            return defered.resolve(model);
        });

        promise.error((data, status) => defered.reject(data));

        return defered.promise;
    }

    queryMany(name, params, options, headers) {
        if (options == null) { options = {}; }
        if (headers == null) { headers = false; }
        let url = this.urls.resolve(name);
        let httpOptions = {headers: {}};

        if (!options.enablePagination) {
            httpOptions.headers["x-disable-pagination"] =  "1";
        }

        return this.http.get(url, params, httpOptions).then(data => {
            let result =  _.map(data.data, x => this.model.make_model(name, x));

            if (headers) {
                return [result, data.headers];
            }

            return result;
        });
    }

    queryOneAttribute(name, id, attribute, params, options) {
        if (options == null) { options = {}; }
        let url = this.urls.resolve(name, id);
        let httpOptions = {headers: {}};

        if (!options.enablePagination) {
            httpOptions.headers["x-disable-pagination"] =  "1";
        }

        return this.http.get(url, params, httpOptions).then(data => {
            let model = this.model.make_model(name, data.data[attribute]);
            model.parent = id;

            return model;
        });
    }

    queryOne(name, id, params, options) {
        if (options == null) { options = {}; }
        let url = this.urls.resolve(name);
        if (id) { url = `${url}/${id}`; }
        let httpOptions = {headers: {}};
        if (!options.enablePagination) {
            httpOptions.headers["x-disable-pagination"] =  "1";
        }

        return this.http.get(url, params, httpOptions).then(data => {
            return this.model.make_model(name, data.data);
        });
    }

    queryOneRaw(name, id, params, options) {
        if (options == null) { options = {}; }
        let url = this.urls.resolve(name);
        if (id) { url = `${url}/${id}`; }
        let httpOptions = _.merge({headers: {}}, options);
        if (!options.enablePagination) {
            httpOptions.headers["x-disable-pagination"] =  "1";
        }
        return this.http.get(url, params, httpOptions).then(data => {
            return data.data;
        });
    }

    queryPaginated(name, params, options) {
        if (options == null) { options = {}; }
        let url = this.urls.resolve(name);
        let httpOptions = _.merge({headers: {}}, options);
        return this.http.get(url, params, httpOptions).then(data => {
            let headers = data.headers();
            let result:any = {};
            result.models = _.map(data.data, x => this.model.make_model(name, x));
            result.count = parseInt(headers["x-pagination-count"], 10);
            result.current = parseInt(headers["x-pagination-current"] || 1, 10);
            result.paginatedBy = parseInt(headers["x-paginated-by"], 10);
            return result;
        });
    }

    queryOnePaginatedRaw(name, id, params, options) {
        if (options == null) { options = {}; }
        let url = this.urls.resolve(name);
        if (id) { url = `${url}/${id}`; }
        let httpOptions = _.merge({headers: {}}, options);

        return this.http.get(url, params, httpOptions).then(data => {
            let headers = data.headers();
            let result:any = {};
            result.data = data.data;
            result.count = parseInt(headers["x-pagination-count"], 10);
            result.current = parseInt(headers["x-pagination-current"] || 1, 10);
            result.paginatedBy = parseInt(headers["x-paginated-by"], 10);

            return result;
        });
    }

    resolve(options) {
        let params:any = {};
        if (options.pslug != null) { params.project = options.pslug; }
        if (options.usref != null) { params.us = options.usref; }
        if (options.taskref != null) { params.task = options.taskref; }
        if (options.issueref != null) { params.issue = options.issueref; }
        if (options.sslug != null) { params.milestone = options.sslug; }
        if (options.wikipage != null) { params.wikipage = options.wikipage; }
        if (options.ref != null) { params.ref = options.ref; }

        let cache = !(options.wikipage || options.sslug);
        return this.queryOneRaw("resolver", null, params, {cache});
    }
}
RepositoryService.initClass();


let module = angular.module("taigaBase");
module.service("$tgRepo", RepositoryService);