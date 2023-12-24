import { ActionPanel, Action, List, Detail, Keyboard } from "@raycast/api";
import { useFetch, Response } from "@raycast/utils";
import { FunctionComponent, useEffect, useState } from "react";
import { URLSearchParams } from "node:url";
import { parse } from 'node-html-parser';
import { DateTime } from "luxon";
import axios from "axios";


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

interface ListItem {
  name: string;
  link: string;
  type: 'directory' | 'zip' | 'txt' | 'html' | 'log' | 'unknown'
  itemType: 'branch' | 'build' | 'file'
  lastModified: DateTime;
}

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const [allBranches, setAllBranches] = useState<Branch[] | undefined>([]);
  const [filteredBranches, setFilteredBranches] = useState<Branch[]>([]);

  useEffect(() => {
    axios.get("http://build/me/id360/webhost/")
      .then((response) => {
        const parsedResponse = parseAllBranchHTML(response.data);
        const sortedBranches = parsedResponse.sort((a, b) => {
          return b.latestBuildTime.toMillis() - a.latestBuildTime.toMillis();
        })
        setAllBranches(parsedResponse);
        setFilteredBranches(parsedResponse);
      })
      .catch(() => {
        setAllBranches(undefined);
      });
  }, []);

  useEffect(() => {
    if (allBranches !== undefined) {
      const fzf = (a: string, b: string) => {
        var hay = a.toLowerCase(), i = 0, n = -1, l;
        b = b.toLowerCase();
        for (; l = b[i++];) if (!~(n = hay.indexOf(l, n + 1))) return false;
        return true;
      };
      setFilteredBranches(allBranches?.filter(b => fzf(b.name, searchText)));
    }
  }, [searchText])

  if (allBranches === undefined) {
    return <Detail markdown={'Something went wrong'} />
  }

  return (
    <List
      isLoading={allBranches.length == 0}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search branches..."
      throttle
    >
      <List.Section title="Branches" subtitle={filteredBranches.length + ''}>
        {filteredBranches?.map((searchResult) => (
          <SearchListItem key={searchResult.name} searchResult={{ ...searchResult, success: undefined }} />
        ))}
      </List.Section>
    </List>
  );
}

function SearchListItem({ searchResult }: { searchResult: Build }) {
  console.log(searchResult);
  return (
    <List.Item
      id={searchResult.name}
      title={searchResult.name}
      subtitle={searchResult.success ? "" : "Build Failed"}
      accessories={[{ date: searchResult.latestBuildTime.toJSDate() }]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push title="Search branch" target={<BranchBuildList branch={searchResult} />} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="Open in browser" url={searchResult.link} shortcut={{ key: 'return', modifiers: ['cmd'] }} />
            <Action.CopyToClipboard title="Copy URL to Clipboard" content={searchResult.link} shortcut={{ key: 'c', modifiers: ['cmd'] }} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function BranchBuildList({ branch }: { branch: Branch }) {
  const [searchText, setSearchText] = useState("");
  const [allBuilds, setAllBuilds] = useState<Build[] | undefined>([]);
  const [filteredBuilds, setFilteredBuilds] = useState<Build[]>([]);

  useEffect(() => {
    axios.get("http://build/me/id360/webhost/" + branch.name)
      .then(async (response) => {
        let parsedResponse = parseAllBuildsHTML(response.data, true);
        if (parsedResponse.filter(b => b.name == 'ErrorLogs').length > 0) {
          parsedResponse = parsedResponse.filter(b => b.name !== 'ErrorLogs');
          const { data } = await axios.get("http://build/me/id360/webhost/" + branch.name + '/ErrorLogs');
          let failedBuilds = parseAllBuildsHTML(data, false);
          parsedResponse.push(...failedBuilds);
        }
        const sortedBranches = parsedResponse.sort((a, b) => {
          return b.latestBuildTime.toMillis() - a.latestBuildTime.toMillis();
        })


        setAllBuilds(parsedResponse);
        setFilteredBuilds(parsedResponse);
      })
      .catch(() => {
        setAllBuilds(undefined);
      });
  }, []);

  useEffect(() => {
    if (allBuilds !== undefined) {
      const fzf = (a: string, b: string) => {
        var hay = a.toLowerCase(), i = 0, n = -1, l;
        b = b.toLowerCase();
        for (; l = b[i++];) if (!~(n = hay.indexOf(l, n + 1))) return false;
        return true;
      };
      setFilteredBuilds(allBuilds?.filter(b => fzf(b.name, searchText)));
    }
  }, [searchText])

  if (allBuilds === undefined) {
    return <Detail markdown={'Something went wrong'} />
  }

  return (
    <List
      isLoading={allBuilds.length == 0}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search branches..."
      throttle
    >
      <List.Section title="Branches" subtitle={filteredBuilds.length + ''}>
        {filteredBuilds?.map((searchResult) => (
          <SearchListItem key={searchResult.name} searchResult={searchResult} />
        ))}
      </List.Section>
    </List>
  );
}


function parseAllBuildsHTML(allBuildsResHTML: string, branch: string, success: boolean): Build[] {
  console.log("Fetched All Builds");
  var htmlDoc = parse(allBuildsResHTML as string);
  const parsedAllBranches = htmlDoc.getElementsByTagName('tr').slice(3).map(branchEl => {
    const linkEl = branchEl.getElementsByTagName('a').at(0);
    if (!linkEl) {
      return null;
    }
    const buildName = linkEl.innerHTML.slice(0, -1);
    const latestBuildTime = branchEl.getElementsByTagName('td').at(2)?.innerHTML;
    return {
      name: buildName,
      latestBuildTime: DateTime.fromFormat(latestBuildTime?.trim() || '', 'yyyy-MM-dd HH:mm'),
      link: 'http://build/me/id360/webhost/' + branch + '/' + buildName,
      success
    } as Build;
  });


  function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
  }
  return parsedAllBranches.filter(notEmpty);
}

function parseAllBranchHTML(allBranchesResHTML: string): Branch[] {
  console.log("Fetched All Branches");
  var htmlDoc = parse(allBranchesResHTML as string);
  const parsedAllBranches = htmlDoc.getElementsByTagName('tr').slice(3).map(branchEl => {
    const linkEl = branchEl.getElementsByTagName('a').at(0);
    if (!linkEl) {
      return null;
    }
    const branchName = linkEl.innerHTML.slice(0, -1);
    const latestBuildTime = branchEl.getElementsByTagName('td').at(2)?.innerHTML;
    return {
      name: branchName,
      latestBuildTime: DateTime.fromFormat(latestBuildTime?.trim() || '', 'yyyy-MM-dd HH:mm'),
      link: 'http://build/me/id360/webhost' + linkEl.getAttribute('href')
    } as Branch;
  });


  function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
  }
  return parsedAllBranches.filter(notEmpty);
}

