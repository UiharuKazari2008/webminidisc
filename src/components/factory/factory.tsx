import { Box, IconButton, Tab, Tabs, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { ModeFlag, isValidFragment, TitleCell, Fragment, getTitleByTrackNumber } from 'netmd-tocmanip';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { exploitDownloadTracks, readToc, writeModifiedTOC } from '../../redux/factory/factory-actions';
import { useShallowEqualSelector } from '../../utils';
import { actions as factoryActions } from '../../redux/factory/factory-feature';
import { FactoryModeEditDialog } from './factory-fragment-mode-edit-dialog';
import { batchActions } from 'redux-batched-actions';
import { ExploitCapability } from '../../services/netmd';
import DoneIcon from '@material-ui/icons/Done';
import CloseIcon from '@material-ui/icons/Close';
import GetAppIcon from '@material-ui/icons/GetApp';
import {
    DisplayableBlock,
    DiscAddressInput,
    ModeInput,
    CellInput,
    LinkSelector,
    ComponentOrDisabled,
    TocTable,
    LabeledSelector,
} from './factory-components';
import { FactoryModeProgressDialog } from './factory-progress-dialog';
import { FactoryModeEditOtherValuesDialog } from './factory-edit-other-values-dialog';
import { FactoryTopMenu } from './factory-topmenu';

const useStyles = makeStyles(theme => ({
    tocTable: {
        display: 'flex',
        flexDirection: 'row',
        gap: 20,
    },
    tocRoot: {
        marginTop: theme.spacing(2),
        marginBottom: theme.spacing(1),
    },
    tocCell: {
        padding: 0,
        border: '1px solid lightgray',
        fontFamily: 'monospace',
        textAlign: 'center',
        cursor: 'pointer',
        boxSizing: 'border-box',
        opacity: 0.7,
        fontSize: 10,
    },
    headBox: {
        display: 'flex',
        justifyContent: 'space-between',
    },
    editedFieldName: {
        marginRight: theme.spacing(2),
    },
    editedFieldDiv: {
        display: 'flex',
        alignItems: 'center',
    },
    linkInput: {
        width: 50,
    },
    modeInput: {
        width: 50,
        marginRight: theme.spacing(2),
    },
    addressInputCluster: {
        width: 50,
    },
    addressInputSector: {
        width: 25,
    },
    addressInputGroup: {
        width: 10,
    },
    cellInput: {
        width: 200,
    },
    infoText: {
        marginTop: theme.spacing(2),
    },
    dataHeaderContainer: {
        display: 'flex',
        justifyContent: 'space-between',
        minHeight: theme.spacing(6),
        alignItems: 'center',
    },
}));

function gcd(a: number, b: number): number {
    if (a === 0) return b;
    return gcd(b % a, a);
}

const Toc = () => {
    const classes = useStyles();
    const dispatch = useDispatch();
    const { toc, modified, firmwareVersion, exploitCapabilities } = useShallowEqualSelector(state => state.factory);
    const { deviceName } = useShallowEqualSelector(state => state.main);
    const { visible: factoryFragmentDialogVisible } = useShallowEqualSelector(state => state.factoryFragmentModeEditDialog);
    const { visible: factoryProgressDialogVisible } = useShallowEqualSelector(state => state.factoryProgressDialog);
    const [selectedTile, setSelectedTile] = useState(-1);
    const [selectedTab, setSelectedTab] = useState(0);

    const [mapTable, setMapTable] = useState<DisplayableBlock[]>([]);
    const [contentsTable, setContentsTable] = useState<DisplayableBlock[]>([]);
    const [showingIndices, setShowingIndices] = useState<boolean>(false);
    const [highlitedContents, setHighlitedContents] = useState<number[]>([]);
    const [contentCounter, setContentCounter] = useState<number>(0);

    const junctionTables = useMemo(() => (toc ? [toc?.trackMap, toc?.titleMap, toc?.timestampMap] : []), [toc]);
    const counterResetValue = useMemo(() => {
        if (contentsTable.length === 0) return 0;
        const all = contentsTable.map(n => n.contents.length).reduce((a, b) => a * b, 1);
        let gcdValue = contentsTable[0].contents.length;
        for (let i = 0; i < contentsTable.length; i++) {
            gcdValue = gcd(contentsTable[i].contents.length, gcdValue);
            if (gcdValue === 1) break;
        }
        return all / gcdValue;
    }, [contentsTable]);

    const dialogVisible = factoryFragmentDialogVisible || factoryProgressDialogVisible;

    const handleKeyUpdate = useCallback(
        (e: KeyboardEvent) => {
            setShowingIndices(e.shiftKey);
        },
        [setShowingIndices]
    );

    useEffect(() => {
        window.addEventListener('keydown', handleKeyUpdate, true);
        window.addEventListener('keyup', handleKeyUpdate, true);
        return () => {
            window.removeEventListener('keydown', handleKeyUpdate, true);
            window.removeEventListener('keyup', handleKeyUpdate, true);
        };
    }, [handleKeyUpdate]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (dialogVisible) return;
            setContentCounter(contentCounter => (contentCounter === counterResetValue ? 0 : contentCounter + 1));
        }, 500);
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [setContentCounter, counterResetValue, dialogVisible]);

    const handleTabChange = useCallback(
        (event: any, newValue: number) => {
            setSelectedTab(newValue);
            setSelectedTile(-1);
            setHighlitedContents([]);
        },
        [setSelectedTab, setSelectedTile, setHighlitedContents]
    );

    const handleSelectionChange = useCallback(
        (newIndex: number) => {
            setSelectedTile(newIndex);
            let newHighlited: number[] = [];

            function lookBack(source: (TitleCell | Fragment)[], index: number) {
                if (index === 0) return; // Linked to zero means not linked.
                let linkedToThis = source.map((n, i) => ({ ...n, i })).filter(n => n.link === index);
                linkedToThis
                    .filter(n => !newHighlited.includes(n.i))
                    .forEach(n => {
                        newHighlited.push(n.i);
                        lookBack(source, n.i);
                    });
            }

            if (selectedTab === 0) {
                let fragmentIndex = newIndex >= 256 ? newIndex - 256 : toc!.trackMap[newIndex];

                lookBack(toc!.trackFragmentList, fragmentIndex);
                // Look forward
                let i = fragmentIndex;
                while (!newHighlited.includes(i)) {
                    newHighlited.push(i);
                    i = toc!.trackFragmentList[i].link;
                    if (i === 0) break;
                }
            } else if (selectedTab === 1) {
                let cellIndex = newIndex >= 256 ? newIndex - 256 : toc!.titleMap[newIndex];

                lookBack(toc!.titleCellList, cellIndex);
                // Look forward
                let i = cellIndex;
                while (!newHighlited.includes(i)) {
                    newHighlited.push(i);
                    i = toc!.titleCellList[i].link;
                    if (i === 0) break;
                }
            }
            setHighlitedContents(newHighlited);
        },
        [setSelectedTile, selectedTab, toc, setHighlitedContents]
    );

    const handleUpdateLink = useCallback(
        (newLink: number) => {
            let newTOC = JSON.parse(JSON.stringify(toc));
            [newTOC.trackMap, newTOC.titleMap, newTOC.timeMap][selectedTab][selectedTile] = newLink;
            dispatch(batchActions([factoryActions.setToc(newTOC), factoryActions.setModified(true)]));
        },
        [dispatch, toc, selectedTab, selectedTile]
    );

    const handleUpdateTOCSpace = useCallback(
        (name: string, value: any) => {
            const newTOC = JSON.parse(JSON.stringify(toc));
            [newTOC.trackFragmentList, newTOC.titleCellList, newTOC.timeList][selectedTab][selectedTile - 256][name] = value;
            dispatch(batchActions([factoryActions.setToc(newTOC), factoryActions.setModified(true)]));
        },
        [dispatch, toc, selectedTab, selectedTile]
    );

    const handleWriteTOC = useCallback(() => {
        dispatch(writeModifiedTOC());
    }, [dispatch]);

    const handleReloadTOC = useCallback(() => {
        dispatch(readToc());
    }, [dispatch]);

    const handleDownloadTrack = useCallback(
        (track: number) => {
            dispatch(exploitDownloadTracks([track]));
        },
        [dispatch]
    );

    function applyParameters<T>(
        target: DisplayableBlock[],
        source: T[],
        condition: (element: T, index: number) => boolean,
        text: string,
        color: string,
        elseText?: string,
        elseColor?: string
    ) {
        let i = 0;
        for (let elem of source) {
            if (condition(elem, i)) {
                target[i].contents.push({ text, color });
            } else if (elseText !== undefined) {
                target[i].contents.push({ text: elseText, color: elseColor ?? '' });
            }
            ++i;
        }
    }

    useEffect(() => {
        const newMap = Array(256)
            .fill(0)
            .map(n => ({ current: 0, contents: [] }));
        const newContents = Array(256)
            .fill(0)
            .map(n => ({ current: 0, contents: [] }));
        applyParameters(newMap, junctionTables[selectedTab] ?? [], e => e !== 0, 'L', '#5ec8f9', 'U'); // Apply 'Linked' and 'Unlinked' parameters
        switch (selectedTab) {
            case 0:
                // Position sector
                applyParameters(
                    newContents,
                    toc?.trackFragmentList ?? [],
                    (e, i) => e.mode !== 0 && !toc?.trackFragmentList.map(n => n.link).includes(i),
                    'R',
                    'blue'
                ); //Apply 'Root' parameter
                applyParameters(
                    newContents,
                    toc?.trackFragmentList ?? [],
                    (e, i) => !toc?.trackMap.includes(i) && !toc?.trackFragmentList.map(n => n.link).includes(i) && e.mode !== 0,
                    'U',
                    'red'
                ); // Unlinked parameter

                applyParameters(
                    newContents,
                    toc?.trackFragmentList ?? [],
                    e => (e.mode & ModeFlag.F_STEREO) !== 0 && (e.mode & ModeFlag.F_SP_MODE) !== 0,
                    'S',
                    '#5ec8f9'
                ); // SP Stereo
                applyParameters(
                    newContents,
                    toc?.trackFragmentList ?? [],
                    e => (e.mode & ModeFlag.F_STEREO) === 0 && (e.mode & ModeFlag.F_SP_MODE) !== 0,
                    'M',
                    '#5ef98f'
                ); // SP Mono
                applyParameters(
                    newContents,
                    toc?.trackFragmentList ?? [],
                    e => (e.mode & ModeFlag.F_STEREO) !== 0 && (e.mode & ModeFlag.F_SP_MODE) === 0,
                    '2',
                    '#f95ec8'
                ); // LP2
                applyParameters(
                    newContents,
                    toc?.trackFragmentList ?? [],
                    e => (e.mode & ModeFlag.F_STEREO) === 0 && (e.mode & ModeFlag.F_SP_MODE) === 0 && isValidFragment(e),
                    '4',
                    '#f98f5e'
                ); // LP4

                break;
            case 1:
                // Half-Width sector
                applyParameters(newContents, toc?.titleCellList ?? [], e => e.title !== '\0\0\0\0\0\0\0', 'T', '#5ec8f9'); // Text
                applyParameters(
                    newContents,
                    toc?.titleCellList ?? [],
                    (e, i) =>
                        !toc?.titleMap.includes(i) && !toc?.titleCellList.map(n => n.link).includes(i) && e.title !== '\0\0\0\0\0\0\0',
                    'U',
                    'red'
                ); // Apply unlinked parameter
                break;
            case 2:
                applyParameters(
                    newContents,
                    toc?.timestampList ?? [],
                    e => (e.year || e.day || e.hour || e.minute || e.month || e.second) !== 0,
                    'T',
                    '#5ec8f9'
                );
                break;
        }

        newContents.filter(n => n.contents.length === 0).forEach(n => (n.contents as any).push({ text: 'U', color: '' }));
        setMapTable(newMap);
        setContentsTable(newContents);
    }, [selectedTab, toc, junctionTables, setContentsTable, setMapTable]);

    const calculatedSpaceString = useMemo(() => {
        let fragmentsSpace: string[] = [];
        let index = toc?.trackMap[selectedTile] ?? 0;
        let i = 0;
        while (index !== 0) {
            const fragment = toc?.trackFragmentList[index];
            if (!fragment) return '';
            fragmentsSpace.push(
                fragment.start.cluster.toString(16).padStart(4, '0') +
                    '.' +
                    fragment.start.sector.toString(16).padStart(2, '0') +
                    '.' +
                    fragment.start.group.toString(16) +
                    '...' +
                    fragment.end.cluster.toString(16).padStart(4, '0') +
                    '.' +
                    fragment.end.sector.toString(16).padStart(2, '0') +
                    '.' +
                    fragment.end.group.toString(16)
            );
            index = fragment.link;
            if (++i > 2) {
                break;
            }
        }
        return fragmentsSpace.join(', ') + (i > 2 ? '...' : '');
    }, [toc, selectedTile]);

    return (
        <React.Fragment>
            <Box className={classes.headBox}>
                <Typography component="h1" variant="h4">
                    {deviceName || `Loading...`}
                </Typography>
                <span>
                    {modified && (
                        <React.Fragment>
                            <IconButton onClick={handleReloadTOC} aria-label="reloadTOC">
                                <CloseIcon />
                            </IconButton>
                            <ComponentOrDisabled disabled={!exploitCapabilities.includes(ExploitCapability.flushUTOC)}>
                                <IconButton
                                    disabled={!exploitCapabilities.includes(ExploitCapability.flushUTOC)}
                                    onClick={handleWriteTOC}
                                    aria-label="updateTOC"
                                >
                                    <DoneIcon />
                                </IconButton>
                            </ComponentOrDisabled>
                        </React.Fragment>
                    )}
                    <FactoryTopMenu />
                </span>
            </Box>
            <Typography component="h2" variant="body2">
                Firmware version {firmwareVersion || '??'}
            </Typography>
            <Tabs value={selectedTab} onChange={handleTabChange}>
                <Tab label="Position Sector" />
                <Tab label="Half-Width Sector" />
                <Tab label="Timestamp Sector" />
            </Tabs>
            <Box className={`${classes.tocTable} ${classes.tocRoot}`}>
                <TocTable
                    showingIndices={showingIndices}
                    highlitedIndices={[]}
                    onSelectionChanged={i => handleSelectionChange(i)}
                    selectedIndex={selectedTile}
                    data={mapTable}
                    contentCounter={0}
                    name="Track Junction Map"
                />
                <TocTable
                    showingIndices={showingIndices}
                    highlitedIndices={highlitedContents}
                    onSelectionChanged={i => handleSelectionChange(i + 256)}
                    selectedIndex={selectedTile - 256}
                    data={contentsTable}
                    contentCounter={contentCounter}
                    name={['Track Fragment Map', 'Title Cells Map', 'Timestamps Map'][selectedTab]}
                />
            </Box>
            {toc && (
                <React.Fragment>
                    {selectedTile !== -1 && selectedTile < 256 && (
                        <div>
                            <div className={`${classes.dataHeaderContainer} ${classes.infoText}`}>
                                <Typography variant="h5">Track {selectedTile}</Typography>
                                {selectedTab === 0 && selectedTile !== 0 && junctionTables[selectedTab][selectedTile] !== 0 && (
                                    <ComponentOrDisabled disabled={!exploitCapabilities.includes(ExploitCapability.downloadAtrac)}>
                                        <IconButton
                                            disabled={!exploitCapabilities.includes(ExploitCapability.downloadAtrac) || modified}
                                            onClick={e => handleDownloadTrack(selectedTile - 1)}
                                        >
                                            <GetAppIcon />
                                        </IconButton>
                                    </ComponentOrDisabled>
                                )}
                            </div>
                            <LinkSelector value={junctionTables[selectedTab][selectedTile]} setValue={handleUpdateLink} />
                            {junctionTables[selectedTab][selectedTile] !== 0 && (
                                <React.Fragment>
                                    {selectedTab === 0 && (
                                        <React.Fragment>
                                            <Typography className={classes.infoText} variant="body2">
                                                Used mode:{' '}
                                                {Array(32)
                                                    .fill(0)
                                                    .map((_, i) =>
                                                        (toc.trackFragmentList[toc.trackMap[selectedTile]].mode & (1 << i)) !== 0
                                                            ? ModeFlag[1 << i]
                                                            : null
                                                    )
                                                    .filter(n => n !== null)
                                                    .join(', ')}
                                            </Typography>
                                            <Typography className={classes.infoText} variant="body2">
                                                Used space: {calculatedSpaceString}
                                            </Typography>
                                        </React.Fragment>
                                    )}
                                </React.Fragment>
                            )}
                            {selectedTab === 1 && (
                                <React.Fragment>
                                    <Typography className={classes.infoText} variant="body2">
                                        Full title: {getTitleByTrackNumber(toc, selectedTile)}
                                    </Typography>
                                </React.Fragment>
                            )}
                        </div>
                    )}
                    {selectedTile >= 256 && (
                        <div>
                            {selectedTab === 0 && (
                                <React.Fragment>
                                    <Typography variant="h5" className={classes.infoText}>
                                        Fragment {selectedTile - 256}
                                    </Typography>
                                    <DiscAddressInput
                                        name="Start"
                                        value={toc.trackFragmentList[selectedTile - 256].start}
                                        setValue={e => handleUpdateTOCSpace('start', e)}
                                    />
                                    <DiscAddressInput
                                        name="End"
                                        value={toc.trackFragmentList[selectedTile - 256].end}
                                        setValue={e => handleUpdateTOCSpace('end', e)}
                                    />
                                    <ModeInput
                                        value={toc.trackFragmentList[selectedTile - 256].mode}
                                        setValue={e => handleUpdateTOCSpace('mode', e)}
                                        fragmentIndex={selectedTile - 256}
                                    />
                                    <LinkSelector
                                        value={toc.trackFragmentList[selectedTile - 256].link}
                                        setValue={e => handleUpdateTOCSpace('link', e)}
                                    />
                                </React.Fragment>
                            )}
                            {selectedTab === 1 && (
                                <React.Fragment>
                                    <Typography variant="h5" className={classes.infoText}>
                                        Cell {selectedTile - 256}
                                    </Typography>
                                    <CellInput
                                        value={toc.titleCellList[selectedTile - 256].title}
                                        setValue={e => handleUpdateTOCSpace('title', e)}
                                    />
                                    <LinkSelector
                                        value={toc.titleCellList[selectedTile - 256].link}
                                        setValue={e => handleUpdateTOCSpace('link', e)}
                                    />
                                </React.Fragment>
                            )}
                            {selectedTab === 2 && (
                                <React.Fragment>
                                    <Typography variant="h5" className={classes.infoText}>
                                        Timestamp {selectedTile - 256}
                                    </Typography>
                                    <LabeledSelector
                                        value={toc.timestampList[selectedTile - 256].year}
                                        setValue={e => handleUpdateTOCSpace('year', e)}
                                        name="Year"
                                    />
                                    <LabeledSelector
                                        value={toc.timestampList[selectedTile - 256].month}
                                        setValue={e => handleUpdateTOCSpace('month', e)}
                                        name="Month"
                                    />
                                    <LabeledSelector
                                        value={toc.timestampList[selectedTile - 256].day}
                                        setValue={e => handleUpdateTOCSpace('day', e)}
                                        name="Day"
                                    />
                                    <LabeledSelector
                                        value={toc.timestampList[selectedTile - 256].hour}
                                        setValue={e => handleUpdateTOCSpace('hour', e)}
                                        name="Hour"
                                    />
                                    <LabeledSelector
                                        value={toc.timestampList[selectedTile - 256].minute}
                                        setValue={e => handleUpdateTOCSpace('minute', e)}
                                        name="Minute"
                                    />
                                    <LabeledSelector
                                        value={toc.timestampList[selectedTile - 256].signature}
                                        setValue={e => handleUpdateTOCSpace('signature', e)}
                                        name="Signature"
                                        bytes={2}
                                    />
                                </React.Fragment>
                            )}
                        </div>
                    )}
                </React.Fragment>
            )}
            <FactoryModeEditDialog />
            <FactoryModeProgressDialog />
            <FactoryModeEditOtherValuesDialog />
        </React.Fragment>
    );
};

export default Toc;
