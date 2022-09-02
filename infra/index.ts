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
