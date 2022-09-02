import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as documentdb from "@pulumi/azure-native/documentdb";
import * as web from "@pulumi/azure-native/web";
import { local } from "@pulumi/command";

const config = new pulumi.Config();

// --- Create the resource group ---
const resourceGroup = new resources.ResourceGroup("resourceGroup");

// --- Create the Database and get a connection string---
const cosmosdbAccount = new documentdb.DatabaseAccount("merndemo-mongodb", {
    kind: "MongoDB",
    resourceGroupName: resourceGroup.name,
    databaseAccountOfferType: documentdb.DatabaseAccountOfferType.Standard,
    locations: [{
        locationName: resourceGroup.location,
        failoverPriority: 0,
    }],
    consistencyPolicy: {
        defaultConsistencyLevel: documentdb.DefaultConsistencyLevel.Session,
    },
    apiProperties: {
        serverVersion: "4.2"
    }
});

const db = new documentdb.MongoDBResourceMongoDBDatabase("mongoDBResourceMongoDBDatabase", {
    accountName: cosmosdbAccount.name,
    databaseName: "grocery-list",
    location: resourceGroup.location,
    options: {},
    resource: {
        id: "grocery-list",
    },
    resourceGroupName: resourceGroup.name,
    tags: {},
});

const listConnStrings = documentdb.listDatabaseAccountConnectionStringsOutput({
    resourceGroupName: resourceGroup.name,
    accountName: cosmosdbAccount.name,
});

const connStrings = listConnStrings.connectionStrings;

export const connString = connStrings?.apply( s => {
    return s?.find( x => x.description === "Primary MongoDB Connection String" )?.connectionString || "";
});

// Uhhh...

// --- Create the storage and upload backend app as an archive ---
const storageAccount = new storage.StorageAccount("sa", {
    resourceGroupName: resourceGroup.name,
    kind: storage.Kind.StorageV2,
    sku: {
        name: storage.SkuName.Standard_LRS,
    },
});

const storageContainer = new storage.BlobContainer("container", {
    resourceGroupName: resourceGroup.name,
    accountName: storageAccount.name,
    publicAccess: storage.PublicAccess.Blob,
});

const backendBuild = new local.Command("backendBuild", {
    dir: "../backend",
    create: pulumi.interpolate `npm install && npm run build`,
});

const blob = new storage.Blob("blob", {
    resourceGroupName: resourceGroup.name,
    accountName: storageAccount.name,
    containerName: storageContainer.name,
    source: new pulumi.asset.FileArchive("../backend"),
});

// /uhh

// --- Make an App Service WebApp from the uploaded storage blob ---
const backendPlan = new web.AppServicePlan("backendPlan", {
    kind: "linux",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    name: "backendService",
    reserved: true,
    sku: {
        tier: "Free",
        name: "F1",
        capacity: 1,
    }
});

// Note: The name of this WebApp must be globally unique so you should choose your own
const backend = new web.WebApp("backendPulumiApp", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    serverFarmId: backendPlan.id,
    name: "backendPulumiApp",
    siteConfig: {
        appSettings: [
            {
                name: "DATABASE_URL",
                value: connString,
            },
            {
                name: "WEBSITE_RUN_FROM_PACKAGE",
                value: blob.url,
            },
        ],
        cors: {
            allowedOrigins: [ "*" ],
        },
        appCommandLine: "npm start",
        linuxFxVersion: "NODE|16-lts",
        use32BitWorkerProcess: true,
    }
});

export const backendUrl = pulumi.interpolate `https://${backend.defaultHostName}`;

// --- Create the frontend ---
const app = new web.StaticSite("frontend", {
    resourceGroupName: resourceGroup.name,
    location: "westus2",
    name: "frontendWebsite",
    branch: "main",
    repositoryUrl: config.require( "repo" ),
    repositoryToken: config.require( "gh_token" ),
    buildProperties: {
        appBuildCommand: pulumi.interpolate `export VITE_API_URL=${backendUrl} && npm install && npm run build`,
        outputLocation: "dist",
        appLocation: "frontend",
    },
    sku: {
        name: "Free",
        tier: "Free",
    },
});

export const url = app.defaultHostname;
