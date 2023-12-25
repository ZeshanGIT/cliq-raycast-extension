import { ActionPanel, Action, List, Detail, Keyboard, Form, closeMainWindow, useNavigation } from "@raycast/api";
import { useFetch, Response, useExec } from "@raycast/utils";
import { FunctionComponent, useEffect, useState } from "react";
import { URLSearchParams } from "node:url";
import { parse } from 'node-html-parser';
import { DateTime } from "luxon";
import axios from "axios";
import fs from "fs";
import { title } from "node:process";
import { join } from 'path';
import path from "node:path";

interface Branch {
  name: string;
  link: string;
  latestBuildTime: DateTime;
}

interface Build {
  name: string;
  link: string;
  latestBuildTime: DateTime;
  success: boolean | undefined
}

const itemTypes = ['branch', 'build', 'file'];

interface ListItem {
  name: string;
  link: string;
  fileType: string;
  itemType: string;
  lastModified: DateTime;
}

export default function Command() {
  return (
    <BranchBuildFileList itemType="branch" path="http://build/me/id360/webhost/" title="Search Branches..." />
  );
}

function SearchListItem({ searchResult }: { searchResult: ListItem }) {
  let icon = searchResult.fileType;
  if (searchResult.itemType == 'build' && searchResult.link.includes('ErrorLogs/')) {
    icon = 'failed';
  }
  let searchTerm = "Search ";
  if (searchResult.itemType == 'branch') {
    searchTerm += " Branches...";
  } else {
    const tmp = searchResult.link.split('/');
    searchTerm += " in ";
    searchTerm += tmp[tmp.length - 2];
  }
  return (
    <List.Item
      icon={{ source: icon + ".png" }}
      id={searchResult.name}
      title={searchResult.name}
      subtitle={searchResult.itemType == 'build' && searchResult.link.includes('ErrorLogs/') ? "Build Failed" : ""}
      accessories={[{ date: searchResult.lastModified.toJSDate() }]}
      quickLook={{ path: searchResult.link, name: searchResult.name }}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {searchResult.fileType == 'directory' ?
              (<Action.Push
                title={title}
                target={
                  <BranchBuildFileList
                    path={searchResult.link}
                    itemType={itemTypes.at(itemTypes.indexOf(searchResult.itemType) + 1) ?? 'file'}
                    title={searchTerm}
                  />
                } />
              )
              : null
            }
          </ActionPanel.Section>
          <ActionPanel.Section>
            {
              searchResult.name === "idmpod.zip"
              && (<Action.Push title="Install build" target={<InstallBuild buildLink={searchResult.link} />} />)
            }
            <Action.OpenInBrowser title="Open in browser" url={searchResult.link} shortcut={{ key: 'return', modifiers: ['cmd'] }} />
            <Action.CopyToClipboard title="Copy URL to Clipboard" content={searchResult.link} shortcut={{ key: 'c', modifiers: ['cmd'] }} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function InstallingBuild({ formState }: { formState: BuildInstallFormState }) {
  function editPropertiesFile() {
    // Read the properties file.
    const fileContent = fs.readFileSync(formState.cloudProps ?? '', 'utf8');

    // Parse the properties file into a JavaScript object.
    const properties: any = {};
    fileContent.split('\n').forEach((line) => {
      const [key, value] = line.split('=');
      properties[key] = value;
    });

    // Update the property value.
    properties["proj.dir.install"] = formState.installationDir ?? '';
    properties["proj.remote.build.url"] = formState.buildLink ?? '';

    // Write the updated properties file back to disk.
    fs.writeFileSync(formState.cloudProps ?? '', Object.keys(properties).map((key) => `${key}=${properties[key]}`).join('\n'), 'utf8');
  }
  editPropertiesFile();
  return (
    <Detail isLoading={isLoading} markdown={error?.message ?? data ?? ''} navigationTitle="Installing build" />
  );
}

interface BuildInstallFormState {
  buildLink: string;
  cloudXML: string | undefined;
  cloudXMLError: string | undefined;
  cloudProps: string | undefined;
  cloudPropsError: string | undefined;
  installationDir: string | undefined;
  installationDirError: string | undefined;
};

function InstallBuild({ buildLink }: { buildLink: string }) {

  const [formState, setFormState] = useState<BuildInstallFormState>({ buildLink } as BuildInstallFormState);
  const { push } = useNavigation();
  async function handleSubmit() {
    console.log("Submitted");
    if (formState.cloudXML === undefined && formState.cloudXMLError !== undefined) {
      setFormState({ ...formState, cloudXMLError: "Must pick cloud.xml" })
      return;
    }
    if (formState.cloudProps === undefined && formState.cloudPropsError !== undefined) {
      setFormState({ ...formState, cloudXMLError: "Must pick cloud.properties" })
      return;
    }
    push(<InstallingBuild formState={formState} />);
  }
  return (
    <Form
      navigationTitle={"Install Build"}
      searchBarAccessory={
        <Form.LinkAccessory
          text={"Installing in " + formState?.installationDir}
          target={"Installing in " + formState?.installationDir} />
      }
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        canChooseFiles={false}
        canChooseDirectories={true}
        onChange={(dir) => setFormState({ ...formState, installationDir: dir.at(0) })}
        defaultValue={["/Users/seshan-12821/Data/builds"]}
        id="directoryPicker"
        title="Pick Installation Directory"
        allowMultipleSelection={false} />
      <Form.FilePicker
        id="cloudXML"
        canChooseFiles={true}
        canChooseDirectories={false}
        allowMultipleSelection={false}
        title="Pick build file (cloud.xml)"
        onChange={(f) => {
          if (path.parse(f.at(0) ?? '').base === "cloud.xml") {
            setFormState({ ...formState, cloudXML: f.at(0), cloudXMLError: undefined });
          } else {
            setFormState({ ...formState, cloudXMLError: "Must pick only cloud.xml" })
          }
        }}
        error={formState.cloudXMLError}
      />
      <Form.FilePicker
        id="cloudproperties"
        canChooseFiles={true}
        canChooseDirectories={false}
        allowMultipleSelection={false}
        title="Pick build file (cloud.properties)"
        onChange={(f) => {
          if (path.parse(f.at(0) ?? '').base === "cloud.properties") {
            setFormState({ ...formState, cloudProps: f.at(0), cloudPropsError: undefined });
          } else {
            setFormState({ ...formState, cloudPropsError: "Must pick only cloud.properties" })
          }
        }}
        error={formState.cloudPropsError}
      />
    </Form>
  );
}

function groupAndSortListItems(listItems: ListItem[]): ListItem[] {
  // Group items by fileType
  const groupedItems: Record<string, ListItem[]> = {};

  for (const listItem of listItems) {
    const fileType = listItem.fileType;
    if (!groupedItems[fileType]) {
      groupedItems[fileType] = [];
    }
    groupedItems[fileType].push(listItem);
  }

  // Sort each group by lastModified
  const sortedItems: ListItem[] = [];

  // Directories first
  if (groupedItems['directory']) {
    sortedItems.push(...groupedItems['directory'].sort((a, b) =>
      b.lastModified.toMillis() - a.lastModified.toMillis()
    ));
  }

  // Sort other file types
  const fileTypesToSort = ['zip', 'txt', 'log', 'unknown'];

  for (const fileType of fileTypesToSort) {
    if (groupedItems[fileType]) {
      sortedItems.push(...groupedItems[fileType].sort((a, b) =>
        b.lastModified.toMillis() - a.lastModified.toMillis()
      ));
    }
  }

  return sortedItems;
}

function parseList({ html, path, itemType }: { html: string, path: string, itemType: string }): ListItem[] {
  var htmlDoc = parse(html as string);
  htmlDoc.querySelector("body > table.table.table-bordered")?.remove();
  const allItems = htmlDoc.getElementsByTagName('tr').slice(3).map(branchEl => {
    const linkEl = branchEl.getElementsByTagName('a').at(0);
    if (!linkEl) {
      return null;
    }
    let temp = linkEl.innerHTML.split('.');
    const itemLink = path + linkEl.innerHTML;
    const type = temp.at(temp.length - 1);
    let thisItemType: string = 'unknown';
    if (itemType == 'build' && linkEl.innerHTML == 'ErrorLogs/') {
      thisItemType = 'failed';
    } else if (itemLink.endsWith('/')) {
      thisItemType = 'directory';
    } else {
      thisItemType = temp[temp.length - 1]
    }
    const latestBuildTime = branchEl.getElementsByTagName('td').at(2)?.innerHTML;
    const li = {
      name: linkEl.innerHTML,
      lastModified: DateTime.fromFormat(latestBuildTime?.trim() || '', 'yyyy-MM-dd HH:mm'),
      link: itemLink,
      itemType: itemType,
      fileType: thisItemType
    } as ListItem;

    return li;
  });


  function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
  }
  return allItems.filter(notEmpty);
}


function BranchBuildFileList({ path, itemType, title }: { path: string, itemType: string, title: string }) {


  const [searchText, setSearchText] = useState("");
  const [allItems, setAllItems] = useState<ListItem[] | undefined>([]);
  const [filteredItems, setFilteredItems] = useState<ListItem[]>([]);

  useEffect(() => {
    axios.get(path)
      .then(async (response) => {
        let parsedResponse = parseList({
          html: response.data,
          path: path,
          itemType
        });
        if (parsedResponse.filter(b => b.name == 'ErrorLogs/').length > 0) {
          parsedResponse = parsedResponse.filter(b => b.name !== 'ErrorLogs/');
          const { data } = await axios.get(path + '/ErrorLogs');
          let failedBuilds = parseList({
            html: data,
            itemType: 'build',
            path: path + '/ErrorLogs' + "/"
          });
          parsedResponse.push(...failedBuilds);
        }


        const sortedBranches = groupAndSortListItems(parsedResponse);

        setAllItems(sortedBranches);
        setFilteredItems(sortedBranches);
      })
      .catch(() => {
        setAllItems(undefined);
      });
  }, []);

  useEffect(() => {
    if (allItems !== undefined) {
      const fzf = (a: string, b: string) => {
        var hay = a.toLowerCase(), i = 0, n = -1, l;
        b = b.toLowerCase();
        for (; l = b[i++];) if (!~(n = hay.indexOf(l, n + 1))) return false;
        return true;
      };
      setFilteredItems(allItems?.filter(b => fzf(b.name, searchText)));
    }
  }, [searchText])

  if (allItems === undefined) {
    return <Detail markdown={'Something went wrong'} />
  }

  return (
    <List
      isLoading={allItems.length == 0}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={title}
      throttle
    >
      <List.Section title={itemType} subtitle={filteredItems.length + ''}>
        {filteredItems?.map((searchResult) => (
          <SearchListItem key={searchResult.name} searchResult={searchResult} />
        ))}
      </List.Section>
    </List>
  );
}