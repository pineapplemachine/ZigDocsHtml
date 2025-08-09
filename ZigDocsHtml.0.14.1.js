/**
 * 
 * Usage:
 * node ZigDocsHtml.0.14.1.js std/0.14.1
 * 
 * The directory provided as an argument should contain these files, which
 * are normally hosted where ever generated Zig docs are available:
 * - basis/main.wasm
 * - basis/sources.tar
 * 
 * The script will write its output directly to the given directory.
 * 
 */

const fs = require("fs");
const path = require("path");
const {TextDecoder, TextEncoder} = require("util");

const LOG_err = 0;
const LOG_warn = 1;
const LOG_info = 2;
const LOG_debug = 3;

const CAT_namespace = 0;
const CAT_container = 1;
const CAT_global_variable = 2;
const CAT_function = 3;
const CAT_primitive = 4;
const CAT_error_set = 5;
const CAT_global_const = 6;
const CAT_alias = 7;
const CAT_type = 8;
const CAT_type_type = 9;
const CAT_type_function = 10;

function sanitizeFqn(fqn) {
    return encodeURI(fqn);
}

function renderTemplate(template, replacements) {
    let text = template;
    for(const replKey in replacements) {
        text = text.replaceAll("{{" + replKey + "}}", replacements[replKey]);
    }
    return text;
}

function splitFqn(fqn) {
    return (fqn && fqn.match(/(@"[^"]*")|[^.]+/g)) || [];
}

class WasmApi {
    constructor(exports) {
        this.exports = exports;
        this.text_decoder = new TextDecoder();
        this.text_encoder = new TextEncoder();
    }
    
    loadTarBuffer(tarBuffer) {
        const ptr = this.exports.alloc(tarBuffer.length);
        const wasm_array = new Uint8Array(this.exports.memory.buffer, ptr, tarBuffer.length);
        wasm_array.set(tarBuffer);
        this.exports.unpack(ptr, tarBuffer.length);
    }
    
    unwrapString(bigint) {
        const ptr = Number(bigint & 0xffffffffn);
        const len = Number(bigint >> 32n);
        const str = this.decodeString(ptr, len);
        return str;
    }

    unwrapSlice32(bigint) {
        const ptr = Number(bigint & 0xffffffffn);
        const len = Number(bigint >> 32n);
        if (len === 0) return [];
        const array = new Uint32Array(this.exports.memory.buffer, ptr, len);
        return array;
    }

    unwrapSlice64(bigint) {
        const ptr = Number(bigint & 0xffffffffn);
        const len = Number(bigint >> 32n);
        if (len === 0) return [];
        const array = new BigUint64Array(this.exports.memory.buffer, ptr, len);
        return array;
    }
    
    decodeString(ptr, len) {
        if (len === 0) return "";
        const array = new Uint8Array(this.exports.memory.buffer, ptr, len);
        return this.text_decoder.decode(array.slice());
    }

    setInputString(s) {
        const jsArray = this.text_encoder.encode(s);
        const len = jsArray.length;
        const ptr = this.exports.set_input_string(len);
        const wasmArray = new Uint8Array(this.exports.memory.buffer, ptr, len);
        wasmArray.set(jsArray);
    }
    
    fullyQualifiedName(decl) {
        return this.unwrapString(this.exports.decl_fqn(decl));
    }
    
    declName(decl) {
        return this.unwrapString(this.exports.decl_name(decl));
    }
    
    declDocsHtml(decl) {
        return this.unwrapString(this.exports.decl_docs_html(decl, false));
    }
    
    declDocsHtmlShort(decl) {
        return this.unwrapString(this.exports.decl_docs_html(decl, true));
    }
    
    declSourceHtml(decl) {
        return this.unwrapString(this.exports.decl_source_html(decl));
    }
    
    declDoctestHtml(decl) {
        return this.unwrapString(this.exports.decl_doctest_html(decl));
    }

    fnProtoHtml(decl_index, linkify_fn_name) {
        const result = this.exports.decl_fn_proto_html(decl_index, linkify_fn_name);
        return this.unwrapString(result);
    }
    
    declFilePath(decl) {
        return this.unwrapString(this.exports.decl_file_path(decl));
    }
    
    declCategoryName(decl) {
        return this.unwrapString(this.exports.decl_category_name(decl));
    }
    
    categorizeDecl(decl) {
        return this.exports.categorize_decl(decl, 0);
    }
    
    namespaceMembers(decl, includePrivate = false) {
        return this.unwrapSlice32(this.exports.namespace_members(decl, includePrivate));
    }
    
    declFields(decl) {
        return this.unwrapSlice32(this.exports.decl_fields(decl));
    }
    
    typeFnFields(decl) {
        return this.unwrapSlice32(this.exports.type_fn_fields(decl));
    }
    
    typeFnMembers(decl) {
        return this.unwrapSlice32(this.exports.type_fn_members(decl));
    }
    
    declParams(decl) {
        return this.unwrapSlice32(this.exports.decl_params(decl));
    }
    
    declErrorSet(decl) {
        return this.unwrapSlice64(this.exports.decl_error_set(decl));
    }
    
    errorSetNodeList(decl, errSetNode) {
        return this.unwrapSlice64(this.exports.error_set_node_list(decl, errSetNode));
    }

    declParamHtml(decl, param) {
        const result = this.exports.decl_param_html(decl, param);
        return this.unwrapString(result);
    }

    declFieldHtml(decl, field) {
        const result = this.exports.decl_field_html(decl, field);
        return this.unwrapString(result);
    }

    errorHtml(decl, error) {
        const result = this.exports.error_html(decl, error);
        return this.unwrapString(result);
    }
    
    findDecl(fqn) {
        this.setInputString(fqn);
        const result = this.exports.find_decl();
        return result === -1 ? null : result;
    }
    
    findFileRoot(path) {
        this.setInputString(path);
        const result = this.exports.find_file_root();
        if (result === -1) return null;
        return result;
    }

    declParent(decl) {
        const result = this.exports.decl_parent(decl);
        if (result === -1) return null;
        return result;
    }

    fnErrorSet(decl) {
        const result = this.exports.fn_error_set(decl);
        if (result === 0) return null;
        return result;
    }
    
    moduleName(decl) {
        return this.unwrapString(this.exports.module_name(decl));
    }
    
    getRootDecl() {
        return this.findDecl(this.moduleName(0));
    }
    
    resolveMaybeAliasedDecl(decl) {
        const declCategory = this.categorizeDecl(decl);
        if(declCategory === CAT_alias) {
            return this.resolveMaybeAliasedDecl(this.exports.get_aliasee());
        }
        else {
            return decl;
        }
    }
    
    getDeclPage(decl) {
        decl = this.resolveMaybeAliasedDecl(decl);
        const declCategory = this.categorizeDecl(decl);
        if(declCategory === CAT_namespace || declCategory === CAT_container) {
            const fqn = this.fullyQualifiedName(decl);
            return sanitizeFqn(fqn) + ".html";
        }
        else {
            const parent = this.declParent(decl);
            if(parent === null) return "";
            return this.getDeclPage(parent);
        }
    }
    
    getDeclLink(decl) {
        decl = this.resolveMaybeAliasedDecl(decl);
        const declCategory = this.categorizeDecl(decl);
        if(declCategory === CAT_namespace || declCategory === CAT_container) {
            return this.getDeclPage(decl);
        }
        else {
            const fqn = this.fullyQualifiedName(decl);
            return this.getDeclPage(decl) + "#" + sanitizeFqn(fqn);
        }
    }
    
    getDeclLineage(decl) {
        let currentDecl = decl;
        const items = [];
        while(currentDecl != null) {
            items.push(currentDecl);
            currentDecl = this.declParent(currentDecl);
        }
        items.reverse();
        return items;
    }
    
    fixHtmlLinks(html) {
        const result = html.replace(/<a href="#([^"]+)"/g, (m, fqn) => {
            const decl = this.findDecl(fqn);
            if(decl === null) return `<a href="#"`;
            const link = this.getDeclLink(decl);
            return `<a href="${link}"`;
        });
        return result;
    }
}

class Docgen {
    constructor(initWasmApi, wasmApi) {
        this.initWasmApi = initWasmApi;
        this.wasmApi = wasmApi;
        this.rootDecl = wasmApi.getRootDecl();
        this.pageFqns = [];
    }
    
    initDecls() {
        console.log("Traversing declarations in root namespace...");
        const declsStack = [this.rootDecl];
        const declsVisited = new Set(declsStack);
        while(declsStack.length) {
            const decl = declsStack.pop();
            const declCategory = this.wasmApi.categorizeDecl(decl);
            if(declCategory === CAT_namespace || declCategory === CAT_container) {
                const fqn = this.wasmApi.fullyQualifiedName(decl);
                this.pageFqns.push(fqn);
            }
            for(const member of this.wasmApi.namespaceMembers(decl)) {
                const memberDecl = this.wasmApi.resolveMaybeAliasedDecl(member);
                if(!declsVisited.has(memberDecl)) {
                    declsStack.push(memberDecl);
                    declsVisited.add(memberDecl);
                }
            }
        }
        console.log(
            `Found ${declsVisited.size} total declarations, ` +
            `of which ${this.pageFqns.length} are page-worthy declarations.`
        );
    }
    
    async render(outputDirPath) {
        this.renderIndex(outputDirPath);
        let pageCount = 0;
        for(const pageFqn of this.pageFqns) {
            const pageDecl = this.wasmApi.resolveMaybeAliasedDecl(
                this.wasmApi.findDecl(pageFqn)
            );
            if(pageDecl === null) {
                throw new Error("Error retrieiving declaration: " + pageFqn);
            }
            const pagePath = path.join(
                outputDirPath,
                this.wasmApi.getDeclPage(pageDecl),
            );
            console.log(`Rendering page ${JSON.stringify(pagePath)}...`);
            const html = this.renderPageHtml(pageDecl);
            await fs.promises.writeFile(pagePath, html, "utf-8");
            if((++pageCount) % 100 === 0) {
                // Workaround for OOM errors with no apparent API for
                // freeing unused memory
                this.wasmApi = await this.initWasmApi();
            }
        }
    }
    
    renderIndex(outputDirPath) {
        const index_path = path.join(outputDirPath, "index.html");
        console.log(`Rendering index page ${JSON.stringify(index_path)}...`);
        const index_html = renderTemplate(HtmlIndexTemplate, {
            "TITLE": this.wasmApi.fullyQualifiedName(this.rootDecl),
            "URL": this.wasmApi.getDeclPage(this.rootDecl),
        });
        fs.writeFileSync(index_path, index_html, "utf-8");
    }
    
    renderPageHtml(decl) {
        return renderTemplate(HtmlPageTemplate, {
            "CONTENT:listNav": this.renderListNavContent(decl),
            "CONTENT:body": this.renderDeclBody(decl),
        });
    }
    
    renderListNavContent(decl) {
        const navParts = [];
        const lineage = this.wasmApi.getDeclLineage(decl);
        if(!lineage.length) return "";
        const rootFqn = this.wasmApi.fullyQualifiedName(lineage[0]);
        const rootFqnParts = splitFqn(rootFqn);
        for(let i = 0; i < rootFqnParts.length - 1; i++) {
            const fqn = rootFqnParts.slice(0, i).join(".");
            const decl = this.wasmApi.findDecl(fqn);
            navParts.push({
                name: rootFqnParts[i],
                href: decl !== null ? this.wasmApi.getDeclLink(decl) : "#",
                className: "",
            });
        }
        for(const lineageDecl of lineage) {
            navParts.push({
                name: this.wasmApi.declName(lineageDecl),
                href: this.wasmApi.getDeclLink(lineageDecl),
                className: "",
            });
        }
        if(navParts.length) {
            navParts[navParts.length - 1].className = "active";
        }
        const html = navParts.map((nav) => {
            return `<li><a href="${nav.href}" class="${nav.className}">${nav.name}</a></li>`;
        }).join("");
        return html;
    }
    
    getCategorizedMembers(decl) {
        const namespaces = [];
        const containers = [];
        const types = [];
        const variables = [];
        const functions = [];
        const errorSets = [];
        const values = [];
        const declCategory = this.wasmApi.categorizeDecl(decl);
        const members = (
            declCategory === CAT_type_function ? this.wasmApi.typeFnMembers(decl).slice() :
            this.wasmApi.namespaceMembers(decl).slice()
        );
        for(const member of members) {
            const memberDecl = this.wasmApi.resolveMaybeAliasedDecl(member);
            const memberDeclCategory = this.wasmApi.categorizeDecl(memberDecl);
            switch(memberDeclCategory) {
                case CAT_namespace:
                    namespaces.push(memberDecl);
                    break;
                case CAT_container:
                    containers.push(memberDecl);
                    break;
                case CAT_global_variable:
                    variables.push(memberDecl);
                    break;
                case CAT_function:
                    functions.push(memberDecl);
                    break;
                case CAT_type:
                case CAT_type_type:
                case CAT_type_function:
                    types.push(memberDecl);
                    break;
                case CAT_error_set:
                    errorSets.push(memberDecl);
                    break;
                case CAT_global_const:
                case CAT_primitive:
                    values.push(memberDecl);
                    break;
                default:
                    throw new Error("Unexpected category: " + memberDeclCategory);
            }
        }
        return {
            namespaces: namespaces,
            containers: containers,
            types: types,
            variables: variables,
            functions: functions,
            errorSets: errorSets,
            values: values,
        };
    }
    
    renderDeclBody(decl, parentStack = null, cyclic = false) {
        parentStack = parentStack || [];
        const memberParentStack = [...parentStack, decl];
        const depth = parentStack.length;
        const header = "h" + String(depth + 1);
        const subheader = "h" + String(depth + 2);
        const members = this.getCategorizedMembers(decl);
        const declName = this.wasmApi.declName(decl);
        const declFqn = this.wasmApi.fullyQualifiedName(decl);
        const sourceId = `src.zig-${sanitizeFqn(declFqn)}`;
        return renderTemplate(HtmlDeclTemplate, {
            "ID:header": sanitizeFqn(declFqn),
            "TAG:header": header,
            "TAG:subheader": subheader,
            "ID:sectSourceHeader": sourceId,
            "CONTENT:declHeaderCategory": this.wasmApi.declCategoryName(decl),
            "CONTENT:declHeaderIdentifier": depth === 0 ? declFqn : declName,
            "CONTENT:fnProto": cyclic ? "" : this.renderFnProto(decl),
            "CONTENT:tldDocs": cyclic ? "" : this.renderTld(decl),
            "CONTENT:params": cyclic ? "" : this.renderParams(decl, subheader),
            "CONTENT:listFnErrors": cyclic ? "" : this.renderFnErrors(decl, subheader),
            "CONTENT:fields": cyclic ? "" : this.renderFields(decl, subheader),
            "CONTENT:namespaces": cyclic ? "" : this.renderNamespaces(members.namespaces, subheader),
            "CONTENT:containers": cyclic ? "" : this.renderContainers(members.containers, subheader),
            "CONTENT:types": cyclic ? "" : this.renderMembers(members.types, subheader, memberParentStack, {
                "HEADER": "Types",
                "CLASS": "sectTypes",
                "CONTENT_CLASS": "listTypes",
            }),
            "CONTENT:globalVars": cyclic ? "" : this.renderMembers(members.variables, subheader, memberParentStack, {
                "HEADER": "Global Variables",
                "CLASS": "sectGlobalVars",
                "CONTENT_CLASS": "listGlobalVars",
            }),
            "CONTENT:values": cyclic ? "" : this.renderMembers(members.values, subheader, memberParentStack, {
                "HEADER": "Values",
                "CLASS": "sectValues",
                "CONTENT_CLASS": "listValues",
            }),
            "CONTENT:fns": cyclic ? "" : this.renderMembers(members.functions, subheader, memberParentStack, {
                "HEADER": "Functions",
                "CLASS": "sectFns",
                "CONTENT_CLASS": "listFns",
            }),
            "CONTENT:errSets": cyclic ? "" : this.renderMembers(members.errorSets, subheader, memberParentStack, {
                "HEADER": "Error Sets",
                "CLASS": "sectErrSets",
                "CONTENT_CLASS": "listErrSets",
            }),
            "CONTENT:docTests": cyclic ? "" : this.renderDocTests(decl, subheader),
            "CONTENT:source": cyclic ? "" : this.renderSource(decl, subheader, sourceId),
        });
    }
    
    renderFnProto(decl) {
        const declCategory = this.wasmApi.categorizeDecl(decl);
        if(declCategory !== CAT_function) return "";
        const code = this.wasmApi.fnProtoHtml(decl, false);
        if(!code) return "";
        return renderTemplate(HtmlDeclFnProtoTemplate, {
            "CONTENT": this.wasmApi.fixHtmlLinks(code),
        });
    }
    
    renderTld(decl) {
        const tld = this.wasmApi.declDocsHtml(decl)
        if(!tld) return "";
        return renderTemplate(HtmlDeclTldTemplate, {
            "CONTENT": this.wasmApi.fixHtmlLinks(tld),
        });
    }
    
    renderParams(decl, subheader) {
        const params = this.wasmApi.declParams(decl).slice();
        if(!params.length) return "";
        return renderTemplate(HtmlDeclParamsTemplate, {
            "TAG:subheader": subheader,
            "CONTENT": Array.from(params).map((param) => {
                const content = this.wasmApi.fixHtmlLinks(
                    this.wasmApi.declParamHtml(decl, param).slice()
                );
                return `<div>${content}</div>`;
            }).join(""),
        });
    }
    
    renderFnErrors(decl, subheader) {
        const errors = this.wasmApi.declErrorSet(decl).slice();
        if(!errors.length) return "";
        return renderTemplate(HtmlDeclFnErrorsTemplate, {
            "TAG:subheader": subheader,
            "CONTENT": Array.from(errors).map((error) => {
                const content = this.wasmApi.fixHtmlLinks(
                    this.wasmApi.errorHtml(decl, error)
                );
                return `<div>${content}</div>`;
            }).join(""),
        });
    }
    
    renderFields(decl, subheader) {
        const declCategory = this.wasmApi.categorizeDecl(decl);
        const fields = (
            declCategory === CAT_type_function ? this.wasmApi.typeFnFields(decl).slice() :
            this.wasmApi.declFields(decl).slice()
        );
        if(!fields.length) return "";
        return renderTemplate(HtmlDeclFieldsTemplate, {
            "TAG:subheader": subheader,
            "CONTENT": Array.from(fields).map((field) => {
                const content = this.wasmApi.fixHtmlLinks(
                    this.wasmApi.declFieldHtml(decl, field).slice()
                );
                return `<div>${content}</div>`;
            }).join(""),
        });
    }
    
    renderNamespaces(namespaceMembers, subheader) {
        if(!namespaceMembers.length) return "";
        return renderTemplate(HtmlDeclNamespacesTemplate, {
            "TAG:subheader": subheader,
            "CONTENT": namespaceMembers.map((ns) => {
                const name = this.wasmApi.fullyQualifiedName(ns);
                const link = this.wasmApi.getDeclLink(ns);
                return `<li><a href="${link}">${name}</a></li>`;
            }).join(""),
        });
    }
    
    renderContainers(containerMembers, subheader) {
        if(!containerMembers.length) return "";
        return renderTemplate(HtmlDeclContainersTemplate, {
            "TAG:subheader": subheader,
            "CONTENT": containerMembers.map((container) => {
                const name = this.wasmApi.fullyQualifiedName(container);
                const link = this.wasmApi.getDeclLink(container);
                return `<li><a href="${link}">${name}</a></li>`;
            }).join(""),
        });
    }
    
    renderDocTests(decl, subheader) {
        const tests = this.wasmApi.declDoctestHtml(decl)
        if(!tests) return "";
        return renderTemplate(HtmlDeclDocTestsTemplate, {
            "TAG:subheader": subheader,
            "CONTENT": this.wasmApi.fixHtmlLinks(tests),
        });
    }
    
    renderSource(decl, subheader, sourceId) {
        const src = this.wasmApi.declSourceHtml(decl)
        if(!src) return "";
        return renderTemplate(HtmlDeclSourceTemplate, {
            "TAG:subheader": subheader,
            "ID:sectSourceHeader": sourceId,
            "CONTENT": this.wasmApi.fixHtmlLinks(src),
        });
    }
    
    renderMembers(members, subheader, parentStack, templateData) {
        if(!members.length) return "";
        return renderTemplate(HtmlDeclMembersTemplate, {
            ...templateData,
            "TAG:subheader": subheader,
            "CONTENT": members.map((member) => {
                const cyclic = parentStack.indexOf(member) >= 0;
                return this.renderDeclBody(member, parentStack, cyclic);
            }).join(""),
        });
    }
}

async function initWasmApi(data_dir) {
    const wasm_path = path.join(data_dir, "basis/main.wasm");
    const tar_path = path.join(data_dir, "basis/sources.tar");
    console.log(
        `Initializing Zig parser using WASM from ${JSON.stringify(wasm_path)} ` +
        `and Zig sources from ${JSON.stringify(tar_path)}.`
    );
    const [wasmBuffer, tarBuffer] = await Promise.all([
        fs.promises.readFile(wasm_path),
        fs.promises.readFile(tar_path),
    ]);
    const imports = {
        js: {
            log: (level, ptr, len) => {
                const msg = decodeString(ptr, len);
                switch(level) {
                    case LOG_err:
                        console.error(msg);
                        break;
                    case LOG_warn:
                        console.warn(msg);
                        break;
                    case LOG_info:
                        console.info(msg);
                        break;
                    case LOG_debug:
                        console.debug(msg);
                        break;
                }
            },
        },
    };
    const wasmExports = (
        (await WebAssembly.instantiate(wasmBuffer, imports)).instance.exports
    );
    const wasmApi = new WasmApi(wasmExports);
    wasmApi.loadTarBuffer(tarBuffer);
    return wasmApi;
}

async function main() {
    console.log("Starting static site generation...");
    const data_dir = process.argv[2];
    if(!fs.existsSync(data_dir)) {
        console.log(`Directory does not exist: ${JSON.stringify(data_dir)}.`);
        return;
    }
    const docgen = new Docgen(
        () => initWasmApi(data_dir),
        await initWasmApi(data_dir),
    );
    docgen.initDecls();
    await docgen.render(data_dir);
    console.log(`Finished rendering content to ${JSON.stringify(data_dir)}.`);
}

const HtmlDeclFnProtoTemplate = (
    `<div class="fnProto">` +
    `<pre><code class="fnProtoCode">{{CONTENT}}</code></pre>` +
    `</div>`
);

const HtmlDeclTldTemplate = (
    `<div class="tldDocs">{{CONTENT}}</div>`
);

const HtmlDeclParamsTemplate = (
    `<div class="sectParams">` +
    `<{{TAG:subheader}} class="sectionHeader">Parameters</{{TAG:subheader}}>` +
    `<div class="listParams">{{CONTENT}}</div>` +
    `</div>`
);

const HtmlDeclFnErrorsTemplate = (
    `<div class="sectFnErrors">` +
    `<{{TAG:subheader}} class="sectionHeader">Errors</{{TAG:subheader}}>` +
    `<div class="fnErrorsAnyError">` +
    `<p><span class="tok-type">anyerror</span> means the error set is known only at runtime.</p>` +
    `</div>` +
    `<div class="tableFnErrors"><dl class="listFnErrors">{{CONTENT}}</dl></div>` +
    `</div>`
);

const HtmlDeclFieldsTemplate = (
    `<div class="sectFields">` +
    `<{{TAG:subheader}} class="sectionHeader">Fields</{{TAG:subheader}}>` +
    `<div class="listFields">{{CONTENT}}</div>` +
    `</div>`
);

const HtmlDeclNamespacesTemplate = (
    `<div class="sectNamespaces">` +
    `<{{TAG:subheader}} class="sectionHeader">Namespaces</{{TAG:subheader}}>` +
    `<ul class="listNamespaces columns">{{CONTENT}}</ul>` +
    `</div>`
);

const HtmlDeclContainersTemplate = (
    `<div class="sectContainers">` +
    `<{{TAG:subheader}} class="sectionHeader">Container Types</{{TAG:subheader}}>` +
    `<ul class="listContainers columns">{{CONTENT}}</ul>` +
    `</div>`
);

const HtmlDeclDocTestsTemplate = (
    `<div class="sectDocTests">` +
    `<{{TAG:subheader}} class="sectionHeader">Example Usage</{{TAG:subheader}}>` +
    `<pre><code class="docTestsCode">{{CONTENT}}</code></pre>` +
    `</div>`
);

const HtmlDeclSourceTemplate = (
    `<div class="sectSource">` +
    `<{{TAG:subheader}} class="sectionHeader" id="{{ID:sectSourceHeader}}">Source Code</{{TAG:subheader}}>` +
    `<details><summary>Source code</summary><pre><code class="sourceText">{{CONTENT}}</code></pre></details>` +
    `</div>`
);

const HtmlDeclMembersTemplate = (
    `<div class="{{CLASS}}">` +
    `<{{TAG:subheader}} class="sectionHeader">{{HEADER}}</{{TAG:subheader}}>` +
    `<div class="{{CONTENT_CLASS}}">{{CONTENT}}</div>` +
    `</div>`
);

const HtmlDeclTemplate = (
    `<div class="decl">` +
    `<{{TAG:header}} id="{{ID:header}}" class="declHeader">` +
    `<span class="declHeaderCategory">{{CONTENT:declHeaderCategory}}</span>` +
    `<span class="declHeaderIdentifier">{{CONTENT:declHeaderIdentifier}}</span>` +
    `<a href="#{{ID:sectSourceHeader}}">[src]</a>` +
    `</{{TAG:header}}>` +
    `{{CONTENT:fnProto}}` +
    `{{CONTENT:tldDocs}}` +
    `{{CONTENT:params}}` +
    `{{CONTENT:listFnErrors}}` +
    `{{CONTENT:namespaces}}` +
    `{{CONTENT:containers}}` +
    `{{CONTENT:types}}` +
    `{{CONTENT:fields}}` +
    `{{CONTENT:globalVars}}` +
    `{{CONTENT:values}}` +
    `{{CONTENT:errSets}}` +
    `{{CONTENT:fns}}` +
    `{{CONTENT:docTests}}` +
    `{{CONTENT:source}}` +
    `</div>`
);

const HtmlPageTemplate = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zig Documentation</title>
    <link rel="icon" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNTMgMTQwIj48ZyBmaWxsPSIjRjdBNDFEIj48Zz48cG9seWdvbiBwb2ludHM9IjQ2LDIyIDI4LDQ0IDE5LDMwIi8+PHBvbHlnb24gcG9pbnRzPSI0NiwyMiAzMywzMyAyOCw0NCAyMiw0NCAyMiw5NSAzMSw5NSAyMCwxMDAgMTIsMTE3IDAsMTE3IDAsMjIiIHNoYXBlLXJlbmRlcmluZz0iY3Jpc3BFZGdlcyIvPjxwb2x5Z29uIHBvaW50cz0iMzEsOTUgMTIsMTE3IDQsMTA2Ii8+PC9nPjxnPjxwb2x5Z29uIHBvaW50cz0iNTYsMjIgNjIsMzYgMzcsNDQiLz48cG9seWdvbiBwb2ludHM9IjU2LDIyIDExMSwyMiAxMTEsNDQgMzcsNDQgNTYsMzIiIHNoYXBlLXJlbmRlcmluZz0iY3Jpc3BFZGdlcyIvPjxwb2x5Z29uIHBvaW50cz0iMTE2LDk1IDk3LDExNyA5MCwxMDQiLz48cG9seWdvbiBwb2ludHM9IjExNiw5NSAxMDAsMTA0IDk3LDExNyA0MiwxMTcgNDIsOTUiIHNoYXBlLXJlbmRlcmluZz0iY3Jpc3BFZGdlcyIvPjxwb2x5Z29uIHBvaW50cz0iMTUwLDAgNTIsMTE3IDMsMTQwIDEwMSwyMiIvPjwvZz48Zz48cG9seWdvbiBwb2ludHM9IjE0MSwyMiAxNDAsNDAgMTIyLDQ1Ii8+PHBvbHlnb24gcG9pbnRzPSIxNTMsMjIgMTUzLDExNyAxMDYsMTE3IDEyMCwxMDUgMTI1LDk1IDEzMSw5NSAxMzEsNDUgMTIyLDQ1IDEzMiwzNiAxNDEsMjIiIHNoYXBlLXJlbmRlcmluZz0iY3Jpc3BFZGdlcyIvPjxwb2x5Z29uIHBvaW50cz0iMTI1LDk1IDEzMCwxMTAgMTA2LDExNyIvPjwvZz48L2c+PC9zdmc+">
    <style type="text/css">
      *, *::before, *::after {
        box-sizing: border-box;
      }
      body {
        font-family: system-ui, -apple-system, Roboto, "Segoe UI", sans-serif;
        font-size: 16px;
        color: #000000;
      }
      .hidden {
        display: none;
      }
      table {
        width: 100%;
      }
      a {
        color: #2A6286;
      }
      details summary {
        cursor: pointer;
      }
      pre {
        font-family: "Source Code Pro",monospace;
        font-size: 1rem;
        background-color: #F5F5F5;
        padding: 1rem;
        margin: 0;
        overflow-x: auto;
      }
      :not(pre) > code {
        white-space: break-spaces;
      }
      code, code a {
        font-family: "Source Code Pro", monospace;
        font-size: 0.9rem;
      }
      code a {
        color: #000000;
      }
      .listFields > div, .listParams > div {
        margin-bottom: 1rem;
      }
      .declHeader a {
        font-size: 0.7rem;
        padding-left: 1rem;
      }
      .declHeader .declHeaderIdentifier {
        padding-left: 0.75rem;
      }
      .fieldDocs {
        border: 1px solid #F5F5F5;
        border-top: 0px;
        padding: 1px 1rem;
      }

      #logo {
        width: 8rem;
        padding: 0.5rem 1rem;
      }

      #navWrap {
        width: -moz-available;
        width: -webkit-fill-available;
        width: stretch;
        margin-left: 11rem;
      }

      #search {
        width: 100%;
      }

      nav {
        width: 10rem;
        float: left;
      }
      nav h2 {
        font-size: 1.2rem;
        text-decoration: underline;
        margin: 0;
        padding: 0.5rem 0;
        text-align: center;
      }
      nav p {
        margin: 0;
        padding: 0;
        text-align: center;
      }
      section {
        clear: both;
        padding-top: 1rem;
      }
      section .declHeader {
        font-size: 1.3rem;
        border-bottom: 1px dashed;
        margin: 0 0;
      }
      section .sectionHeader {
        font-size: 1.3rem;
        margin: 0.5rem 0;
        padding: 0;
        border-bottom: 1px solid;
      }
      #listNav {
        list-style-type: none;
        margin: 0.5rem 0 0 0;
        padding: 0;
        overflow: hidden;
        background-color: #f1f1f1;
      }
      #listNav li {
        float:left;
      }
      #listNav li a {
        display: block;
        color: #000;
        text-align: center;
        padding: .5rem .8rem;
        text-decoration: none;
      }
      #listNav li a:hover {
        background-color: #555;
        color: #fff;
      }
      #listNav li a.active {
        background-color: #FFBB4D;
        color: #000;
      }
      .sectSource {
        margin-bottom: 2rem;
      }

      #helpDialog {
        width: 21rem;
        height: 21rem;
        position: fixed;
        top: 0;
        left: 0;
        background-color: #333;
        color: #fff;
        border: 1px solid #fff;
      }
      #helpDialog h1 {
        text-align: center;
        font-size: 1.5rem;
      }
      #helpDialog dt, #helpDialog dd {
        display: inline;
        margin: 0 0.2rem;
      }
      kbd {
        color: #000;
        background-color: #fafbfc;
        border-color: #d1d5da;
        border-bottom-color: #c6cbd1;
        box-shadow-color: #c6cbd1;
        display: inline-block;
        padding: 0.3rem 0.2rem;
        font: 1.2rem monospace;
        line-height: 0.8rem;
        vertical-align: middle;
        border: solid 1px;
        border-radius: 3px;
        box-shadow: inset 0 -1px 0;
        cursor: default;
      }

      #errors {
        background-color: #faa;
        position: fixed;
        left: 0;
        bottom: 0;
        width: 100%;
        max-height: min(20rem, 50vh);
        padding: 0.5rem;
        overflow: auto;
      }
      #errors h1 {
        font-size: 1.5rem;
      }
      #errors pre {
        background-color: #fcc;
      }
      
      .decl .decl {
        padding-left: 1rem;
        border-left: 4px solid;
        border-color: #555;
      }

      .listSearchResults li.selected {
        background-color: #93e196;
      }

      .tableFnErrors dt {
        font-weight: bold;
      }

      dl > div {
          padding: 0.5rem;
          border: 1px solid #c0c0c0;
          margin-top: 0.5rem;
      }

      td, th {
        text-align: unset;
        vertical-align: top;
        margin: 0;
        padding: 0.5rem;
        max-width: 20rem;
        text-overflow: ellipsis;
        overflow-x: hidden;
      }

      ul.columns {
        column-width: 20rem;
      }

      .tok-kw {
          color: #333;
          font-weight: bold;
      }
      .tok-str {
          color: #d14;
      }
      .tok-builtin {
          color: #0086b3;
      }
      .tok-comment {
          color: #777;
          font-style: italic;
      }
      .tok-fn {
          color: #900;
          font-weight: bold;
      }
      .tok-null {
          color: #008080;
      }
      .tok-number {
          color: #008080;
      }
      .tok-type {
          color: #458;
          font-weight: bold;
      }

      @media (prefers-color-scheme: dark) {
        body {
          background-color: #111;
          color: #bbb;
        }
        pre {
          background-color: #222;
          color: #ccc;
        }
        a {
          color: #88f;
        }
        code a {
          color: #ccc;
        }
        .fieldDocs {
          border-color:#2A2A2A;
        }
        #listNav {
          background-color: #333;
        }
        #listNav li a {
          color: #fff;
        }
        #listNav li a:hover {
          background-color: #555;
          color: #fff;
        }
        #listNav li a.active {
          background-color: #FFBB4D;
          color: #000;
        }
        .listSearchResults li.selected {
          background-color: #000;
        }
        .listSearchResults li.selected a {
          color: #fff;
        }
        #errors {
          background-color: #800;
          color: #fff;
        }
        #errors pre {
          background-color: #a00;
          color: #fff;
        }
        dl > div {
          border-color: #373737;
        }
        .tok-kw {
            color: #eee;
        }
        .tok-str {
            color: #2e5;
        }
        .tok-builtin {
            color: #ff894c;
        }
        .tok-comment {
            color: #aa7;
        }
        .tok-fn {
            color: #B1A0F8;
        }
        .tok-null {
            color: #ff8080;
        }
        .tok-number {
            color: #ff8080;
        }
        .tok-type {
            color: #68f;
        }
      }
    </style>
  </head>
  <body>
    <nav>
      <a class="logo" href="#">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 140">
        <g fill="#F7A41D">
          <g>
            <polygon points="46,22 28,44 19,30"/>
            <polygon points="46,22 33,33 28,44 22,44 22,95 31,95 20,100 12,117 0,117 0,22" shape-rendering="crispEdges"/>
            <polygon points="31,95 12,117 4,106"/>
          </g>
          <g>
            <polygon points="56,22 62,36 37,44"/>
            <polygon points="56,22 111,22 111,44 37,44 56,32" shape-rendering="crispEdges"/>
            <polygon points="116,95 97,117 90,104"/>
            <polygon points="116,95 100,104 97,117 42,117 42,95" shape-rendering="crispEdges"/>
            <polygon points="150,0 52,117 3,140 101,22"/>
          </g>
          <g>
            <polygon points="141,22 140,40 122,45"/>
            <polygon points="153,22 153,117 106,117 120,105 125,95 131,95 131,45 122,45 132,36 141,22" shape-rendering="crispEdges"/>
            <polygon points="125,95 130,110 106,117"/>
          </g>
        </g>
        <style>
        #text { fill: #121212 }
        @media (prefers-color-scheme: dark) { #text { fill: #f2f2f2 } }
        </style>
        <g id="text">
          <g>
            <polygon points="260,22 260,37 229,40 177,40 177,22" shape-rendering="crispEdges"/>
            <polygon points="260,37 207,99 207,103 176,103 229,40 229,37"/>
            <polygon points="261,99 261,117 176,117 176,103 206,99" shape-rendering="crispEdges"/>
          </g>
          <rect x="272" y="22" shape-rendering="crispEdges" width="22" height="95"/>
          <g>
            <polygon points="394,67 394,106 376,106 376,81 360,70 346,67" shape-rendering="crispEdges"/>
            <polygon points="360,68 376,81 346,67"/>
            <path d="M394,106c-10.2,7.3-24,12-37.7,12c-29,0-51.1-20.8-51.1-48.3c0-27.3,22.5-48.1,52-48.1    c14.3,0,29.2,5.5,38.9,14l-13,15c-7.1-6.3-16.8-10-25.9-10c-17,0-30.2,12.9-30.2,29.5c0,16.8,13.3,29.6,30.3,29.6    c5.7,0,12.8-2.3,19-5.5L394,106z"/>
          </g>
        </g>
        </svg>
      </a>
    </nav>
    <div id="navWrap">
      <input disabled type="search" id="search" autocomplete="off" spellcheck="false" placeholder="\`s\` to search, \`?\` to see more options">
      <div id="sectNav"><ul id="listNav">{{CONTENT:listNav}}</ul></div>
    </div>
    <section>{{CONTENT:body}}</section>
    <div class="sectSearchResults hidden">
      <h2>Search Results</h2>
      <ul class="listSearchResults"></ul>
    </div>
    <div class="sectSearchNoResults hidden">
      <h2>No Results Found</h2>
      <p>Press escape to exit search and then '?' to see more options.</p>
    </div>
    <div id="helpDialog" class="hidden">
      <h1>Keyboard Shortcuts</h1>
      <dl><dt><kbd>?</kbd></dt><dd>Show this help dialog</dd></dl>
      <dl><dt><kbd>Esc</kbd></dt><dd>Clear focus; close this dialog</dd></dl>
      <dl><dt><kbd>s</kbd></dt><dd>Focus the search field</dd></dl>
      <dl><dt><kbd>u</kbd></dt><dd>Go to source code</dd></dl>
      <dl><dt><kbd>↑</kbd></dt><dd>Move up in search results</dd></dl>
      <dl><dt><kbd>↓</kbd></dt><dd>Move down in search results</dd></dl>
      <dl><dt><kbd>⏎</kbd></dt><dd>Go to active search result</dd></dl>
    </div>
    <div id="errors" class="hidden">
      <h1>Errors</h1>
      <pre id="errorsText"></pre>
    </div>
    <script src="main.js"></script>
  </body>
</html>
`;

const HtmlIndexTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>{{TITLE}}: Redirecting</title>
    <meta http-equiv="refresh" content="0; url={{URL}}" />
</head>
<body>
    <p>Redirecting to documentation for <a href="{{URL}}">{{TITLE}}</a>.</p>
</body>
</html>
`;

main().catch(console.error);
